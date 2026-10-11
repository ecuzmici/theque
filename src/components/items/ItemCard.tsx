"use client";

import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ItemCardActions } from "@/components/items/ItemCardActions";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";
import type { ItemPatchHandler } from "@/lib/item-patch";
import { cn } from "@/lib/utils";

import { cardByline, cardTitle, coverStatusLabel, ItemCardCover } from "./ItemCardCover";

type ItemCardProps = {
  item: LibraryItemRow;
  shelfId: ShelfId;
  itemActionsEnabled?: boolean;
  /** Keyboard-navigation highlight from the library page. */
  selected?: boolean;
  onItemPatch?: ItemPatchHandler;
  onOpenMarkDone?: (item: LibraryItemRow) => void;
};

/** Hold time before a touch press opens the quick actions. */
export const LONG_PRESS_MS = 450;
/** Finger travel (px) that turns a press into a scroll and cancels it. */
const LONG_PRESS_SLOP = 10;

/**
 * Long-press on touch or pen calls `onLongPress` and swallows the click that follows.
 * Mouse presses pass through, so a right-click keeps the browser menu.
 */
function useLongPress(onLongPress: () => void, enabled: boolean) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  if (!enabled) return {};

  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      start.current = null;
      if (e.pointerType === "mouse") return;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fired.current = true;
        navigator.vibrate?.(10);
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current) return;
      const moved = Math.abs(e.clientX - start.current.x) + Math.abs(e.clientY - start.current.y);
      if (moved > LONG_PRESS_SLOP) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    // Cancel the click the browser makes from this touch. The menu would read it
    // as an outside press and close at once.
    onTouchEnd: (e: React.TouchEvent) => {
      if (!fired.current || !e.cancelable) return;
      e.preventDefault();
      // No click follows now, so the next keyboard Enter must not be swallowed.
      fired.current = false;
    },
    // A touch long-press can raise the browser's own context menu. Treat it as ours.
    onContextMenu: (e: React.MouseEvent) => {
      if (!start.current) return;
      e.preventDefault();
      if (!fired.current) {
        clear();
        fired.current = true;
        onLongPress();
      }
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!fired.current) return;
      e.preventDefault();
      e.stopPropagation();
      fired.current = false;
    },
  };
}

/** One cover on the wall: a 2:3 cover, a title line, and a byline line. */
export function ItemCard({
  item,
  shelfId,
  itemActionsEnabled,
  selected,
  onItemPatch,
  onOpenMarkDone,
}: ItemCardProps) {
  const router = useRouter();
  const detailHref = `/item/${item.id}`;
  const [menuOpen, setMenuOpen] = useState(false);
  // Warm the item route on hover, focus, or press so navigation starts promptly.
  const prefetchDetail = useCallback(() => {
    router.prefetch(detailHref);
  }, [router, detailHref]);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const press = useLongPress(openMenu, Boolean(itemActionsEnabled));
  const statusLabel = coverStatusLabel(item);

  return (
    <div data-item-card={item.id} className="group relative">
      <Link
        href={detailHref}
        onPointerEnter={prefetchDetail}
        onFocus={prefetchDetail}
        onPointerDown={(e) => {
          prefetchDetail();
          press.onPointerDown?.(e);
        }}
        onPointerMove={press.onPointerMove}
        onPointerUp={press.onPointerUp}
        onPointerCancel={press.onPointerCancel}
        onTouchEnd={press.onTouchEnd}
        onContextMenu={press.onContextMenu}
        onClickCapture={press.onClickCapture}
        onKeyDown={(e) => {
          // The context-menu key and Shift+F10 open the quick actions from the keyboard.
          if (!itemActionsEnabled) return;
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            e.preventDefault();
            openMenu();
          }
        }}
        className="block rounded-md outline-none transition-transform duration-100 ease-out select-none [-webkit-touch-callout:none] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <ItemCardCover item={item} selected={selected} />
        <p className="mt-1.5 truncate text-[13px] leading-tight font-medium text-foreground">
          {cardTitle(item)}
        </p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">{cardByline(item)}</p>
        {statusLabel ? <span className="sr-only">, {statusLabel}</span> : null}
      </Link>

      {itemActionsEnabled ? (
        <ItemCardActions
          item={item}
          shelfId={shelfId}
          onItemPatch={onItemPatch}
          onOpenMarkDone={onOpenMarkDone}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          // Hidden until hover on a mouse. Touch opens it with a long-press, so the
          // button only anchors the menu there. Keyboard focus shows it.
          triggerClassName={cn(
            "absolute top-1.5 right-1.5 z-10 opacity-0 transition-opacity",
            "group-hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100",
            "pointer-coarse:pointer-events-none",
          )}
        />
      ) : null}
    </div>
  );
}
