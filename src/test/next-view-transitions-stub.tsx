// Test stub for `next-view-transitions`. Its published ESM entry imports
// `next/link` in a way vitest's Node resolver can't follow, so component tests
// that render <Link> fail to load. Aliased in vitest.config.ts. Behaviourally a
// pass-through: <Link> is next/link, the provider renders children, and the
// transition router falls back to the normal app router (no view transition in
// jsdom anyway).
import type { ComponentProps } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";

export function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} />;
}

export function ViewTransitions({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export const useTransitionRouter = useRouter;
