"use client";

import { MoreHorizontal } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORY_LABELS, formatCategory } from "@/lib/item-labels";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import { patchItemRequest, reportSaveError } from "@/lib/save-error";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ItemCategory[];

type PatchPayload = {
  status?: ItemStatus;
  category?: ItemCategory | null;
};

type InboxActionsProps = {
  itemId: string;
  category: ItemCategory | null;
  /** Applies the optimistic change. The returned function undoes it. */
  onOptimistic: (patch: PatchPayload, opts?: { remove?: boolean }) => (() => void) | void;
};

export function InboxActions({ itemId, category, onOptimistic }: InboxActionsProps) {
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    async (body: PatchPayload, opts?: { remove?: boolean }) => {
      const undo = onOptimistic(body, opts);
      setBusy(true);
      try {
        if (!(await patchItemRequest(itemId, body))) {
          undo?.();
          reportSaveError();
        }
      } finally {
        setBusy(false);
      }
    },
    [itemId, onOptimistic],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="secondary"
            className="h-11 min-h-11 min-w-11 gap-1 px-3 bg-card/95 shadow-sm backdrop-blur lg-fine:h-7 lg-fine:min-h-7 lg-fine:w-auto lg-fine:min-w-0"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        }
      >
        <MoreHorizontal className="size-3.5" />
        Triage
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Inbox</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => void apply({ status: "want" }, { remove: true })}>
            Keep · Want
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Wrong type…</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-48 overflow-y-auto">
              {CATEGORIES.map((c) => (
                <DropdownMenuItem
                  key={c}
                  className={category === c ? "font-semibold text-accent-foreground" : undefined}
                  onClick={() => void apply({ category: c, status: "want" }, { remove: true })}
                >
                  {formatCategory(c)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => void apply({ status: "dismissed" }, { remove: true })}
        >
          Dismiss
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
