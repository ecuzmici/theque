"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Clapperboard,
  Command as CommandIcon,
  CopyCheck,
  CornerDownLeft,
  LayoutGrid,
  Loader2,
  Newspaper,
  Plus,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHELVES, type ShelfId } from "@/lib/shelves";
import { filterCommands, looksLikeUrl } from "@/lib/command-palette/commands";
import { cn } from "@/lib/utils";

const OPEN_EVENT = "theque:command-palette:open";

/** Opens the global command palette from anywhere (used by trigger buttons). */
export function openCommandPalette() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  }
}

type ActionCommand = {
  id: string;
  label: string;
  keywords?: string[];
  icon: LucideIcon;
  hint: string;
  href: string;
};

const SHELF_ICONS: Partial<Record<ShelfId, LucideIcon>> = {
  all: LayoutGrid,
  books: BookOpen,
  watch: Clapperboard,
  read: Newspaper,
  done: CheckCircle2,
};

/** Shelves that always show in the steady-state strip — the safe nav set. */
const SHELF_NAV_IDS: ShelfId[] = ["all", "books", "watch", "read", "done"];

function buildCommands(): ActionCommand[] {
  const shelves: ActionCommand[] = SHELF_NAV_IDS.map((id) => {
    const shelf = SHELVES.find((s) => s.id === id)!;
    return {
      id: `shelf:${id}`,
      label: shelf.label,
      keywords: ["shelf", "library", id],
      icon: SHELF_ICONS[id] ?? LayoutGrid,
      hint: "Shelf",
      href: id === "all" ? "/library" : `/library?shelf=${id}`,
    };
  });

  const pages: ActionCommand[] = [
    {
      id: "page:add",
      label: "Add a link",
      keywords: ["new", "save", "capture", "url", "paste"],
      icon: Plus,
      hint: "Page",
      href: "/add",
    },
    {
      id: "page:search",
      label: "Search your library",
      keywords: ["find", "query"],
      icon: Search,
      hint: "Page",
      href: "/search",
    },
    {
      id: "page:settings",
      label: "Settings",
      keywords: ["account", "tokens", "extension"],
      icon: Settings,
      hint: "Page",
      href: "/settings",
    },
  ];

  return [...shelves, ...pages];
}

type SaveStatus = "idle" | "saving" | "saved" | "duplicate" | "failed";
type SaveState = { status: SaveStatus; itemId?: string; message?: string };

const LISTBOX_ID = "command-palette-listbox";
const optionId = (index: number) => `${LISTBOX_ID}-opt-${index}`;

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo(() => buildCommands(), []);
  const urlMode = looksLikeUrl(query);
  const filtered = useMemo(
    () => (urlMode ? [] : filterCommands(commands, query)),
    [commands, query, urlMode],
  );
  const rowCount = urlMode ? 1 : filtered.length;

  const resetState = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    setSave({ status: "idle" });
  }, []);

  const openPalette = useCallback(() => {
    resetState();
    setOpen(true);
  }, [resetState]);

  const closePalette = useCallback(() => setOpen(false), []);

  // Global ⌘K / Ctrl-K toggle + programmatic open from trigger buttons.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) closePalette();
        else openPalette();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, openPalette);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, openPalette);
    };
  }, [open, openPalette, closePalette]);

  // Focus the input when the palette opens (focus only — no state writes).
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(optionId(activeIndex))
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const runCommand = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const quickAdd = useCallback(async (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) return;
    setSave({ status: "saving" });
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, source: "manual" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        item?: { id: string };
        created?: boolean;
      };
      if (!res.ok) {
        setSave({ status: "failed", message: body.code ?? "Could not save link." });
        return;
      }
      setSave({
        status: body.created === false ? "duplicate" : "saved",
        itemId: body.item?.id,
      });
    } catch {
      setSave({ status: "failed", message: "Network error." });
    }
  }, []);

  const activateQuickAdd = useCallback(() => {
    if (save.status === "saving") return;
    if ((save.status === "saved" || save.status === "duplicate") && save.itemId) {
      runCommand(`/item/${save.itemId}`);
      return;
    }
    void quickAdd(query);
  }, [save, query, quickAdd, runCommand]);

  function runActive() {
    if (urlMode) {
      activateQuickAdd();
      return;
    }
    const command = filtered[activeIndex];
    if (command) runCommand(command.href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, rowCount - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runActive();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? openPalette() : closePalette())}>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] translate-y-0 w-full gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search shelves, jump to a page, or paste a link to save it instantly.
        </DialogDescription>

        <div className="flex items-center gap-2.5 border-b border-border px-3.5">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={rowCount > 0 ? optionId(activeIndex) : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search shelves, jump to a page, or paste a link…"
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <ul
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Commands"
          className="max-h-[min(60vh,22rem)] overflow-y-auto p-1.5"
        >
          {urlMode ? (
            <QuickAddRow
              id={optionId(0)}
              selected={activeIndex === 0}
              url={query.trim()}
              save={save}
              onClick={activateQuickAdd}
              onHover={() => setActiveIndex(0)}
            />
          ) : filtered.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              No matches. Paste a link to save it instantly.
            </li>
          ) : (
            filtered.map((command, index) => {
              const Icon = command.icon;
              const selected = index === activeIndex;
              return (
                <li
                  key={command.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runCommand(command.href)}
                  className={cn(
                    "ks-pointer-coarse-min-hit flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    selected
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {command.hint}
                  </span>
                </li>
              );
            })
          )}
        </ul>

        <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-3.5 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CommandIcon className="size-3" aria-hidden /> palette
          </span>
          <span className="hidden sm:inline">↑↓ navigate</span>
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="size-3" aria-hidden /> select
          </span>
          <span className="ml-auto truncate">Paste a URL to save instantly</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddRow({
  id,
  selected,
  url,
  save,
  onClick,
  onHover,
}: {
  id: string;
  selected: boolean;
  url: string;
  save: SaveState;
  onClick: () => void;
  onHover: () => void;
}) {
  const { status, message } = save;
  const Icon =
    status === "saving"
      ? Loader2
      : status === "saved"
        ? CheckCircle2
        : status === "duplicate"
          ? CopyCheck
          : status === "failed"
            ? CircleAlert
            : Plus;

  const title =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved to your library"
        : status === "duplicate"
          ? "Already in your library"
          : status === "failed"
            ? message ?? "Couldn’t save link"
            : "Save link";

  const trailing =
    status === "saved" || status === "duplicate"
      ? "↵ open"
      : status === "failed"
        ? "↵ retry"
        : status === "idle"
          ? "↵ save"
          : "";

  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        "ks-pointer-coarse-min-hit flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
        selected ? "bg-accent text-accent-foreground" : "text-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          status === "saving" && "animate-spin text-muted-foreground motion-reduce:animate-none",
          status === "saved" && "text-emerald-600",
          status === "duplicate" && "text-accent-foreground",
          status === "failed" && "text-destructive",
          status === "idle" && "text-muted-foreground",
        )}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{url}</span>
      </span>
      {status === "saved" || status === "duplicate" ? (
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
      {trailing ? (
        <span className="shrink-0 text-xs text-muted-foreground">{trailing}</span>
      ) : null}
    </li>
  );
}

/** Full-width sidebar trigger (desktop). */
export function CommandTriggerButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 text-left">Search &amp; jump…</span>
      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        ⌘K
      </kbd>
    </button>
  );
}

/** Compact icon trigger (mobile header). */
export function CommandTriggerIcon({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Quick find — search, navigate, or save a link"
      className={cn(
        "ks-pointer-coarse-min-hit inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <Search className="size-5" aria-hidden />
    </button>
  );
}
