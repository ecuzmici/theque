--[[--
theque sync: download new theque books without a tap.

The plugin reads the theque OPDS sync feed (`/opds/new`, newest first). It
downloads each book that it does not know yet into the home folder. It checks:

  - when the device connects to WiFi,
  - when the device wakes up and WiFi is on,
  - every 15 minutes while the device is awake and online,
  - when you tap "theque: check for new books" in the tools menu.

The settings file `settings/theque.lua` holds the feed URL, the user name, the
capture token and the list of known book links. A missing list means first
run: the plugin then marks every book in the feed as known and downloads
nothing, so it never copies the existing library a second time.

@module koplugin.theque
--]]

local DataStorage = require("datastorage")
local InfoMessage = require("ui/widget/infomessage")
local LuaSettings = require("luasettings")
local NetworkMgr = require("ui/network/manager")
local UIManager = require("ui/uimanager")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local http = require("socket.http")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")
local ltn12 = require("ltn12")
local socket = require("socket")
local socketutil = require("socketutil")
local util = require("util")
local _ = require("gettext")

local CHECK_INTERVAL_SEC = 15 * 60
-- A wake-up and a WiFi connection often come together. One check covers both.
local MIN_GAP_SEC = 60
local MAX_DOWNLOADS_PER_CHECK = 20
local ACQUISITION_REL = "http://opds%-spec%.org/acquisition"

-- FileManager and ReaderUI each make an instance of the plugin. These two
-- values are shared, so the instances never run two checks at the same time.
local running = false
local last_check_at = 0

local Theque = WidgetContainer:extend{
    name = "theque",
    is_doc_only = false,
}

local function unescapeXml(text)
    if not text then return nil end
    text = text:gsub("&lt;", "<"):gsub("&gt;", ">"):gsub("&quot;", '"')
        :gsub("&apos;", "'"):gsub("&#39;", "'")
    return (text:gsub("&amp;", "&"))
end

local function openSettings()
    return LuaSettings:open(DataStorage:getSettingsDir() .. "/theque.lua")
end

--- Parse the feed into a list of { href, title, author }, newest first.
local function parseFeed(xml)
    local books = {}
    for entry in xml:gmatch("<entry>(.-)</entry>") do
        local href = entry:match('<link[^>]-rel="' .. ACQUISITION_REL .. '"[^>]-href="([^"]+)"')
        if href then
            table.insert(books, {
                href = unescapeXml(href),
                title = unescapeXml(entry:match("<title>(.-)</title>")) or "Untitled",
                author = unescapeXml(entry:match("<author>%s*<name>(.-)</name>")),
            })
        end
    end
    return books
end

local function fetchFeed(feed_url, username, password)
    local sink = {}
    socketutil:set_timeout(socketutil.LARGE_BLOCK_TIMEOUT, socketutil.LARGE_TOTAL_TIMEOUT)
    local code = socket.skip(1, http.request{
        url = feed_url,
        method = "GET",
        headers = { ["Accept-Encoding"] = "identity" },
        sink = ltn12.sink.table(sink),
        user = username,
        password = password,
    })
    socketutil:reset_timeout()
    if code ~= 200 then
        return nil, "feed status " .. tostring(code)
    end
    return table.concat(sink)
end

--- Download one file to `path`. Write to a temporary name first, so an
--- interrupted download never leaves a broken book in the library.
local function downloadFile(href, path, username, password)
    local tmp = path .. ".part"
    local file = io.open(tmp, "wb")
    if not file then return false end
    socketutil:set_timeout(socketutil.FILE_BLOCK_TIMEOUT, socketutil.FILE_TOTAL_TIMEOUT)
    local code = socket.skip(1, http.request{
        url = href,
        method = "GET",
        headers = { ["Accept-Encoding"] = "identity" },
        sink = ltn12.sink.file(file),
        user = username,
        password = password,
    })
    socketutil:reset_timeout()
    local size = lfs.attributes(tmp, "size") or 0
    if code == 200 and size > 0 and os.rename(tmp, path) then
        return true
    end
    os.remove(tmp)
    logger.warn("theque: download failed", href, code)
    return false
end

local function downloadDir()
    return G_reader_settings:readSetting("home_dir") or "/mnt/us/documents"
end

local function refreshFileManager()
    local ok, FileManager = pcall(require, "apps/filemanager/filemanager")
    if ok and FileManager and FileManager.instance then
        FileManager.instance:onRefresh()
    end
end

function Theque:init()
    self.check_task = function() self:check(false) end
    self.ui.menu:registerToMainMenu(self)
    self:scheduleCheck(5)
end

function Theque:addToMainMenu(menu_items)
    menu_items.theque_sync = {
        text = _("theque: check for new books"),
        sorting_hint = "tools",
        callback = function() self:check(true) end,
    }
end

function Theque:scheduleCheck(delay)
    UIManager:unschedule(self.check_task)
    UIManager:scheduleIn(delay, self.check_task)
end

-- The handlers return nothing, so other plugins also get these events.
function Theque:onNetworkConnected() self:scheduleCheck(3) end
function Theque:onResume() self:scheduleCheck(5) end
function Theque:onSuspend() UIManager:unschedule(self.check_task) end
function Theque:onCloseWidget() UIManager:unschedule(self.check_task) end

function Theque:check(manual)
    UIManager:unschedule(self.check_task)
    if running then return end
    if not manual and os.time() - last_check_at < MIN_GAP_SEC then
        self:scheduleCheck(CHECK_INTERVAL_SEC)
        return
    end
    if not (NetworkMgr:isConnected() and NetworkMgr:isOnline()) then
        if manual then
            UIManager:show(InfoMessage:new{ text = _("theque: turn on WiFi first."), timeout = 3 })
        end
        self:scheduleCheck(CHECK_INTERVAL_SEC)
        return
    end
    running = true
    last_check_at = os.time()
    local ok, result = pcall(self.sync, self, manual)
    running = false
    if not ok then
        logger.warn("theque: check failed", result)
        if manual then
            UIManager:show(InfoMessage:new{ text = _("theque: check failed.") .. "\n" .. tostring(result) })
        end
    end
    self:scheduleCheck(CHECK_INTERVAL_SEC)
end

function Theque:sync(manual)
    local settings = openSettings()
    local feed_url = settings:readSetting("feed_url")
    local username = settings:readSetting("username")
    local password = settings:readSetting("password")
    if not (feed_url and password) then
        error("settings/theque.lua has no feed_url or password")
    end

    local xml, err = fetchFeed(feed_url, username, password)
    if not xml then error(err) end
    local books = parseFeed(xml)

    local known = settings:readSetting("known")
    if not known then
        -- First run: the device already holds the library.
        known = {}
        for i = 1, #books do known[books[i].href] = true end
        settings:saveSetting("known", known)
        settings:flush()
        logger.info("theque: first run, marked", #books, "books as known")
        return
    end

    local new_books = {}
    for i = 1, #books do
        local book = books[i]
        if not known[book.href] and #new_books < MAX_DOWNLOADS_PER_CHECK then
            table.insert(new_books, book)
        end
    end
    if #new_books == 0 then
        if manual then
            UIManager:show(InfoMessage:new{ text = _("theque: no new books."), timeout = 3 })
        end
        return
    end

    local progress = InfoMessage:new{ text = _("theque: downloading new books…") }
    UIManager:show(progress)
    UIManager:forceRePaint()

    local dir = downloadDir()
    local added = {}
    for i = 1, #new_books do
        local book = new_books[i]
        local name = book.author and (book.author .. " - " .. book.title) or book.title
        local path = dir .. "/" .. util.getSafeFilename(name .. ".epub", dir)
        if lfs.attributes(path, "mode") == "file" then
            -- The file is already here, for example from a manual catalog download.
            known[book.href] = true
        elseif downloadFile(book.href, path, username, password) then
            known[book.href] = true
            table.insert(added, book.title)
        end
        settings:saveSetting("known", known)
        settings:flush()
    end

    UIManager:close(progress)
    if #added > 0 then
        refreshFileManager()
        UIManager:show(InfoMessage:new{
            text = _("theque: new on your Kindle") .. "\n\n" .. table.concat(added, "\n"),
            timeout = 5,
        })
    end
end

return Theque
