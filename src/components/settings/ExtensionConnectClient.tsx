"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { connectChromeExtension } from "@/lib/extension-connect-client";

type Status = "idle" | "connecting" | "connected" | "error";

type WebChrome = {
  runtime?: {
    sendMessage: (
      extensionId: string,
      message: unknown,
      callback: (response?: unknown) => void,
    ) => void;
    lastError?: { message?: string };
  };
};

function getChromeRuntime() {
  return (globalThis as { chrome?: WebChrome }).chrome?.runtime ?? null;
}

export function ExtensionConnectClient({
  extensionId,
  email,
  unknownExtension = false,
}: {
  extensionId: string;
  email: string;
  /** The link named an extension id that is not a thèque build. */
  unknownExtension?: boolean;
}) {
  const [status, setStatus] = useState<Status>(extensionId ? "idle" : "error");
  const [message, setMessage] = useState(
    extensionId
      ? "Ready to connect this browser extension."
      : unknownExtension
        ? "Unknown extension. Open this page from the thèque extension popup."
        : "Missing extension id. Open this page from the Chrome extension popup.",
  );
  const attemptedRef = useRef(false);

  const connect = useCallback(async () => {
    const chromeRuntime = getChromeRuntime();
    if (!extensionId) {
      setStatus("error");
      setMessage("Missing extension id. Open this page from the Chrome extension popup.");
      return;
    }
    if (!chromeRuntime) {
      setStatus("error");
      setMessage("Chrome extension messaging is unavailable in this browser.");
      return;
    }

    setStatus("connecting");
    setMessage("Creating a capture token and sending it to the extension...");

    const result = await connectChromeExtension({
      extensionId,
      baseUrl: window.location.origin,
      email,
      chromeRuntime,
    });

    if (result.ok) {
      setStatus("connected");
      setMessage("Connected. You can close this tab and save pages from the extension.");
      return;
    }

    setStatus("error");
    setMessage(
      result.code === "extension_unreachable"
        ? "Could not reach the extension. Reload it in Chrome and try again."
        : "Could not connect the extension. Please try again.",
    );
  }, [email, extensionId]);

  useEffect(() => {
    if (attemptedRef.current || !extensionId) return;
    attemptedRef.current = true;
    void connect();
  }, [connect, extensionId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-xl">Connect Chrome extension</CardTitle>
        <CardDescription>
          This creates a new capture token from your logged-in session and stores it in Chrome.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Signed in as {email}.</p>
        <p
          className={
            status === "connected"
              ? "text-sm text-green-700"
              : status === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
          }
          role="status"
        >
          {message}
        </p>
        <Button type="button" disabled={status === "connecting" || !extensionId} onClick={() => void connect()}>
          {status === "connecting" ? "Connecting..." : "Connect extension"}
        </Button>
      </CardContent>
    </Card>
  );
}
