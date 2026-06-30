"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import {
  type Binding,
  BINDING_STORAGE_KEY,
  DEFAULT_BINDING,
  normalizeBinding,
} from "@/components/theme/binding";

type BindingContextValue = {
  binding: Binding;
  setBinding: (binding: Binding) => void;
};

const BindingContext = createContext<BindingContextValue | null>(null);

/**
 * Applies the chosen binding to <html> as `data-binding`. The default binding
 * sets NO attribute so the base (amber) cascade in globals.css is untouched.
 */
function applyBinding(binding: Binding) {
  const el = document.documentElement;
  if (binding === DEFAULT_BINDING) {
    el.removeAttribute("data-binding");
  } else {
    el.setAttribute("data-binding", binding);
  }
}

export function BindingProvider({ children }: { children: React.ReactNode }) {
  const [binding, setBindingState] = useState<Binding>(DEFAULT_BINDING);

  // Hydrate from localStorage after mount; the inline script in the root layout
  // already applied the attribute for first paint, so this only syncs React state
  // (and re-applies defensively in case the attribute was stripped).
  useEffect(() => {
    const initial = normalizeBinding(localStorage.getItem(BINDING_STORAGE_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only binding hydration
    setBindingState(initial);
    applyBinding(initial);
  }, []);

  const setBinding = useCallback((next: Binding) => {
    setBindingState(next);
    localStorage.setItem(BINDING_STORAGE_KEY, next);
    applyBinding(next);
  }, []);

  return (
    <BindingContext.Provider value={{ binding, setBinding }}>{children}</BindingContext.Provider>
  );
}

export function useBinding() {
  const ctx = useContext(BindingContext);
  if (!ctx) throw new Error("useBinding must be used within BindingProvider");
  return ctx;
}
