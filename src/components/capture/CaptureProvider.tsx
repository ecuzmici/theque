"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { ExtensionNudge } from "@/components/layout/ExtensionNudge";
import { ShellSheet } from "@/components/layout/ShellSheet";

import { CapturePanel } from "./CapturePanel";
import { readClipboardLink, type CaptureSource, type ClipboardLink } from "./capture-link";

export type OpenCaptureOptions = {
  /** A link to offer for one-tap save. When set, the sheet skips the clipboard read. */
  url?: string | null;
  note?: string;
  source?: CaptureSource;
  /** Read the clipboard. Only a user gesture (the + tap) may set this. */
  readClipboard?: boolean;
  /** Where to go when the user closes the sheet without a save. */
  dismissHref?: string;
};

type CaptureRequest = {
  key: number;
  url: string | null;
  note: string;
  source: CaptureSource;
  clipboard: Promise<ClipboardLink> | null;
  dismissHref: string | null;
};

type CaptureContextValue = {
  open: boolean;
  openCapture: (options?: OpenCaptureOptions) => void;
};

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function useCapture(): CaptureContextValue {
  const value = useContext(CaptureContext);
  if (!value) throw new Error("useCapture needs a <CaptureProvider>.");
  return value;
}

/**
 * Holds the capture sheet. Any shell control or route opens it through
 * `useCapture().openCapture()`. A save opens the new item, like the old /add page.
 */
export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<CaptureRequest | null>(null);

  const openCapture = useCallback((options: OpenCaptureOptions = {}) => {
    const url = options.url ?? null;
    // Start the read now, inside the gesture. The panel waits for the result.
    const clipboard = !url && options.readClipboard ? readClipboardLink() : null;
    setRequest((prev) => ({
      key: (prev?.key ?? 0) + 1,
      url,
      note: options.note ?? "",
      source: options.source ?? "manual",
      clipboard,
      dismissHref: options.dismissHref ?? null,
    }));
    setOpen(true);
  }, []);

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && request?.dismissHref) router.replace(request.dismissHref);
    },
    [request, router],
  );

  const onSaved = useCallback(
    (itemId: string | null) => {
      setOpen(false);
      if (itemId) router.push(`/item/${itemId}`);
      router.refresh();
    },
    [router],
  );

  const value = useMemo(() => ({ open, openCapture }), [open, openCapture]);

  return (
    <CaptureContext.Provider value={value}>
      {children}
      <ShellSheet
        open={open}
        onOpenChange={onOpenChange}
        title="Save a link"
        desktopClassName="lg:bottom-28 lg:right-8"
      >
        {request ? (
          <CapturePanel
            key={request.key}
            prefillUrl={request.url}
            prefillNote={request.note}
            source={request.source}
            clipboard={request.clipboard}
            onSaved={onSaved}
            onNavigate={() => setOpen(false)}
          />
        ) : null}
        {/* The extension captures on desktop Chrome only. */}
        <div className="hidden lg:block [&>*]:mt-4">
          <ExtensionNudge />
        </div>
      </ShellSheet>
    </CaptureContext.Provider>
  );
}
