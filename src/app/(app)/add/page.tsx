"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { useCapture } from "@/components/capture/CaptureProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { addPrefill } from "./add-prefill";

/**
 * Entry point for the PWA share target and the iOS Shortcut. It opens the
 * capture sheet with the shared link. Closing the sheet goes to the library.
 */
function AddCapture() {
  const searchParams = useSearchParams();
  const { openCapture } = useCapture();
  const query = searchParams.toString();
  const openedFor = useRef<string | null>(null);

  const prefill = addPrefill({
    url: searchParams.get("url"),
    text: searchParams.get("text"),
    title: searchParams.get("title"),
  });

  useEffect(() => {
    // Open once per incoming query, so a re-render does not reopen a closed sheet.
    if (openedFor.current === query) return;
    openedFor.current = query;
    openCapture({ ...prefill, dismissHref: "/library" });
  }, [openCapture, prefill, query]);

  return (
    <div>
      <PageHeader title="Save a link" />
      <Button
        type="button"
        variant="outline"
        onClick={() => openCapture({ ...prefill, dismissHref: "/library" })}
      >
        Open the capture sheet
      </Button>
    </div>
  );
}

export default function AddPage() {
  return (
    <Suspense>
      <AddCapture />
    </Suspense>
  );
}
