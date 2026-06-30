import { ComparisonLanding } from "@/components/landing/ComparisonLanding";
import { buildMetadata, letterboxdAlternativeConfig } from "@/lib/landing/comparison-pages";

export const metadata = buildMetadata(letterboxdAlternativeConfig);

export default function LetterboxdAlternativePage() {
  return <ComparisonLanding config={letterboxdAlternativeConfig} />;
}
