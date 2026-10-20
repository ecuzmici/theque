local _ = require("gettext")
return {
    name = "theque",
    fullname = _("theque sync"),
    description = _([[Downloads new books from theque when the device connects to WiFi, when it wakes up, and every 15 minutes while it is awake.]]),
}
