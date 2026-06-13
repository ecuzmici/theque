"use client";

import * as React from "react";

type ViewTransitionProps = {
  name?: string;
  children: React.ReactNode;
};

const Impl = (
  React as unknown as { ViewTransition?: React.ComponentType<ViewTransitionProps> }
).ViewTransition;

/**
 * Next's vendored React canary ships <ViewTransition>; the npm `react` used by
 * vitest does not. Fall back to a pass-through so both runtimes render.
 */
export const ViewTransition: React.ComponentType<ViewTransitionProps> =
  Impl ?? (({ children }: ViewTransitionProps) => <>{children}</>);
