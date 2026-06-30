"use client";

import { Check } from "lucide-react";

import { BINDINGS } from "@/components/theme/binding";
import { useBinding } from "@/components/theme/BindingProvider";
import { cn } from "@/lib/utils";

/**
 * Swatch picker for the library "binding" (accent theme). Rendered in Settings.
 * Uses radiogroup semantics; each swatch's padding keeps the tap target ample on
 * coarse pointers (see the ~44px touch policy in globals.css / ADR 0006).
 */
export function BindingPicker() {
  const { binding, setBinding } = useBinding();

  return (
    <div role="radiogroup" aria-label="Library binding" className="flex flex-wrap gap-2.5">
      {BINDINGS.map((b) => {
        const selected = b.id === binding;
        return (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={b.label}
            onClick={() => setBinding(b.id)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-foreground/25 bg-muted/50"
                : "border-border hover:bg-muted/30",
            )}
          >
            <span
              className="flex size-9 items-center justify-center rounded-full shadow-inner ring-1 ring-black/10"
              style={{ backgroundColor: b.swatch }}
            >
              {selected ? <Check className="size-4 text-white" aria-hidden="true" /> : null}
            </span>
            <span
              className={cn(
                "text-xs",
                selected ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {b.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
