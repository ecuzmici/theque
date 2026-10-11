import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/library",
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { email: "emil@example.com" } } } }),
    },
  }),
}));

vi.mock("@/components/library/LibrarySpineBand", () => ({
  LibrarySpineBand: () => <div data-testid="spine-band" />,
}));

vi.mock("@/components/theme/ThemeToggle", () => ({
  ThemeToggle: () => <button type="button">Theme toggle</button>,
}));

vi.mock("@/components/layout/ExtensionNudge", () => ({
  ExtensionNudge: () => null,
}));

function button(label: string): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!el) throw new Error(`No button labelled ${label}`);
  return el;
}

describe("AppShell", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("has a header and a floating + but no sidebar or bottom bar", async () => {
    await act(async () => {
      root?.render(<AppShell>content</AppShell>);
    });

    expect(document.querySelector("aside")).toBeNull();
    expect(document.querySelector('nav[aria-label="Primary"]')).toBeNull();
    expect(document.querySelector('a[href="/library"]')).not.toBeNull();
    expect(button("You").textContent).toBe("E");
    expect(button("Save a link")).toBeDefined();
  });

  it("reads the clipboard when + opens the capture sheet", async () => {
    const readText = vi.fn().mockResolvedValue("https://www.letterboxd.com/film/heat/");
    vi.stubGlobal("navigator", { ...navigator, clipboard: { readText } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ existing: null }), { status: 200 })),
    );

    await act(async () => {
      root?.render(<AppShell>content</AppShell>);
    });
    await act(async () => {
      button("Save a link").click();
    });

    expect(readText).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Save letterboxd.com");
  });

  it("opens the You sheet with counts, Stats, Settings, and the theme toggle", async () => {
    await act(async () => {
      root?.render(<AppShell>content</AppShell>);
    });
    await act(async () => {
      button("You").click();
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.querySelector('[data-testid="spine-band"]')).not.toBeNull();
    expect(dialog?.querySelector('a[href="/stats"]')).not.toBeNull();
    expect(dialog?.querySelector('a[href="/settings"]')).not.toBeNull();
    expect(dialog?.textContent).toContain("Theme toggle");
    expect(dialog?.textContent).toContain("emil@example.com");
  });
});
