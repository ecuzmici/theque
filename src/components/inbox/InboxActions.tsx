"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORY_LABELS } from "@/lib/item-labels";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ItemCategory[];

type PatchPayload = {
  status?: ItemStatus;
  category?: ItemCategory | null;
};

type InboxActionsProps = {
  itemId: string;
  category: ItemCategory | null;
  onOptimistic: (patch: PatchPayload, opts?: { remove?: boolean }) => void;
};

export function InboxActions({ itemId, category, onOptimistic }: InboxActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    async (body: PatchPayload, opts?: { remove?: boolean }) => {
      onOptimistic(body, opts);
      setBusy(true);
      try {
        const res = await fetch(`/api/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) router.refresh();
      } finally {
        setBusy(false);
      }
    },
    [itemId, onOptimistic, router],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="secondary"
            className="h-11 min-h-11 min-w-11 gap-1 px-3 bg-card/95 shadow-sm backdrop-blur lg:h-7 lg:min-h-7 lg:w-auto lg:min-w-0"
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
        <DropdownMenuLabel>Inbox</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => void apply({ status: "want" }, { remove: true })}>
          Keep · Want
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void apply({ status: "planned" }, { remove: true })}>
          Plan
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
                {CATEGORY_LABELS[c]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
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
