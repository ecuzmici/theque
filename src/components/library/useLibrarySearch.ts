"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ItemStatus } from "@/lib/database.types";

const URL_WRITE_DELAY_MS = 300;

/** Writes `?q=` without a navigation, so typing never refetches the page. */
function writeQueryToUrl(q: string) {
  const url = new URL(window.location.href);
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, "", next);
  }
}

/**
 * Library search state. The query lives in `?q=` so it survives reload and
 * back. The status chip is local and resets when the query clears.
 */
export function useLibrarySearch() {
  const urlQuery = useSearchParams().get("q") ?? "";
  const [draft, setDraftState] = useState(urlQuery);
  const [status, setStatus] = useState<ItemStatus | null>(null);
  const writtenRef = useRef(urlQuery);

  // A navigation from outside (for example the Library link) changes `?q=`.
  // Adopt that value, but ignore the values this hook wrote itself.
  useEffect(() => {
    if (urlQuery === writtenRef.current) return;
    writtenRef.current = urlQuery;
    /* eslint-disable react-hooks/set-state-in-effect -- sync the field with an outside URL change */
    setDraftState(urlQuery);
    if (!urlQuery) setStatus(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [urlQuery]);

  const query = draft.trim();

  useEffect(() => {
    if (query === writtenRef.current) return;
    const handle = window.setTimeout(() => {
      writtenRef.current = query;
      writeQueryToUrl(query);
    }, query ? URL_WRITE_DELAY_MS : 0);
    return () => window.clearTimeout(handle);
  }, [query]);

  const setDraft = useCallback((value: string) => {
    setDraftState(value);
    if (!value.trim()) setStatus(null);
  }, []);

  const clear = useCallback(() => {
    setDraftState("");
    setStatus(null);
  }, []);

  return { draft, setDraft, query, active: query.length > 0, status, setStatus, clear };
}
