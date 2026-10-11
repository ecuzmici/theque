import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] w-full max-w-md items-center px-4 py-10">
      <Card className="w-full border-dashed">
        <CardContent className="flex flex-col items-center px-6 py-14 text-center">
          <h1 className="font-heading text-lg font-medium text-card-foreground">Page not found</h1>
          <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
            This page does not exist, or it is not in your library.
          </p>
          <Button nativeButton={false} render={<Link href="/library" />} className="mt-6 min-h-11">
            Go to your library
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
