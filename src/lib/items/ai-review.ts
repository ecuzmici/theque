import { mergeProposedStructured } from "@/lib/enrichment/llm/apply-item-rewrite-proposal";
import { formatCategory } from "@/lib/item-labels";
import type { AiItemRewriteProposal } from "@/lib/types/api";
import type { ItemCategory } from "@/lib/database.types";

type CurrentItemReviewShape = {
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  category: ItemCategory | null;
  category_confidence: number | null;
  structured: Record<string, unknown>;
};

export type AiReviewRow = {
  key:
    | "title"
    | "subtitle"
    | "description"
    | "image_url"
    | "category"
    | "category_confidence"
    | "structured";
  label: string;
  current: string;
  proposed: string;
  changed: boolean;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value, null, 2);
}

export function buildAiReviewRows(
  current: CurrentItemReviewShape,
  proposal: AiItemRewriteProposal,
): AiReviewRow[] {
  const categoryChanged = current.category !== proposal.category;
  const effectiveStructured = mergeProposedStructured(
    current.structured,
    proposal.structured as Record<string, unknown> | undefined,
    categoryChanged,
  );

  const rows: AiReviewRow[] = [
    {
      key: "title",
      label: "Title",
      current: formatValue(current.title),
      proposed: formatValue(proposal.title),
      changed: current.title !== proposal.title,
    },
    {
      key: "subtitle",
      label: "Subtitle",
      current: formatValue(current.subtitle),
      proposed: formatValue(proposal.subtitle),
      changed: current.subtitle !== proposal.subtitle,
    },
    {
      key: "description",
      label: "Description",
      current: formatValue(current.description),
      proposed: formatValue(proposal.description),
      changed: current.description !== proposal.description,
    },
    {
      key: "image_url",
      label: "Image URL",
      current: formatValue(current.image_url),
      proposed: formatValue(proposal.image_url),
      changed: current.image_url !== proposal.image_url,
    },
    {
      key: "category",
      label: "Category",
      current: formatCategory(current.category),
      proposed: formatCategory(proposal.category),
      changed: current.category !== proposal.category,
    },
    {
      key: "category_confidence",
      label: "Category confidence",
      current: formatValue(current.category_confidence),
      proposed: formatValue(proposal.category_confidence),
      changed: current.category_confidence !== proposal.category_confidence,
    },
    {
      key: "structured",
      label: "Structured fields",
      current: formatValue(current.structured),
      proposed: formatValue(effectiveStructured),
      changed: JSON.stringify(current.structured) !== JSON.stringify(effectiveStructured),
    },
  ];

  return rows;
}
