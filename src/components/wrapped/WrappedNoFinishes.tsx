import { Link } from "next-view-transitions";

import { Button } from "@/components/ui/button";

/** The /wrapped page for a library with no finished items in any year. */
export function WrappedNoFinishes() {
  return (
    <div className="flex max-w-md flex-col items-start gap-4 rounded-[var(--ks-radius-card)] border border-border bg-card p-6">
      <p className="font-heading text-2xl text-foreground">Nothing finished yet</p>
      <p className="text-sm text-muted-foreground">
        Your year fills in when you mark a book or a film as done. Open an item and tap a star to rate it.
      </p>
      <Button nativeButton={false} variant="outline" size="lg" className="px-4" render={<Link href="/library" />}>
        Go to library
      </Button>
    </div>
  );
}
