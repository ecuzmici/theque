"use client";

import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ShellSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Show the title as a visible heading. A hidden title still names the dialog. */
  showTitle?: boolean;
  /** Desktop position of the panel, as `lg:` classes (for example `lg:bottom-28 lg:right-8`). */
  desktopClassName?: string;
  children: React.ReactNode;
};

/**
 * The shell's overlay: a bottom sheet on a phone and a small anchored panel on
 * desktop. Escape, the backdrop, and the close button close it.
 */
export function ShellSheet({
  open,
  onOpenChange,
  title,
  showTitle = true,
  desktopClassName,
  children,
}: ShellSheetProps) {
  // Focus the panel, not its first field: on a phone a focused field opens the
  // keyboard over the sheet before the user picks an action.
  const popupRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-[110] bg-black/25 backdrop-blur-[2px] transition-opacity duration-150",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
            "lg:bg-black/5 lg:backdrop-blur-none",
          )}
        />
        <Dialog.Popup
          ref={popupRef}
          initialFocus={popupRef}
          className={cn(
            "fixed z-[120] bg-popover text-popover-foreground shadow-2xl ring-1 ring-border outline-none",
            "transition duration-200 ease-out data-starting-style:translate-y-6 data-starting-style:opacity-0 data-ending-style:translate-y-6 data-ending-style:opacity-0",
            // Phone: bottom sheet.
            "inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
            // Desktop: anchored panel.
            "lg:inset-x-auto lg:max-h-[calc(100dvh-8rem)] lg:w-96 lg:rounded-2xl lg:p-4 lg:data-starting-style:translate-y-2 lg:data-ending-style:translate-y-2",
            desktopClassName,
          )}
        >
          <div className="mx-auto -mt-2 mb-4 h-1 w-10 rounded-full bg-border lg:hidden" aria-hidden />
          <Dialog.Title className={cn("pr-10 font-heading text-lg", !showTitle && "sr-only")}>
            {title}
          </Dialog.Title>
          <div className={cn(showTitle && "mt-3")}>{children}</div>
          <Dialog.Close
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-3 top-4 text-muted-foreground lg:top-3"
              />
            }
          >
            <XIcon aria-hidden />
            <span className="sr-only">Close</span>
          </Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
