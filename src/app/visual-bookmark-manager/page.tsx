import { ComparisonLanding } from "@/components/landing/ComparisonLanding";
import { buildMetadata, visualBookmarkManagerConfig } from "@/lib/landing/comparison-pages";

export const metadata = buildMetadata(visualBookmarkManagerConfig);

export default function VisualBookmarkManagerPage() {
  return <ComparisonLanding config={visualBookmarkManagerConfig} />;
}
