import { ComparisonLanding } from "@/components/landing/ComparisonLanding";
import { buildMetadata, goodreadsAlternativeConfig } from "@/lib/landing/comparison-pages";

export const metadata = buildMetadata(goodreadsAlternativeConfig);

export default function GoodreadsAlternativePage() {
  return <ComparisonLanding config={goodreadsAlternativeConfig} />;
}
