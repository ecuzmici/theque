import { LibraryPageSkeleton } from "@/components/library/LibraryPageSkeleton";

// Route-level Suspense fallback for /library (shown while the page's server
// component resolves). Reserves the full masthead so the skeleton → page swap does
// not shove the tabs/grid down. Shares one skeleton with the in-page fallback in
// page.tsx so both land the grid identically.
export default function LibraryLoading() {
  return <LibraryPageSkeleton />;
}
