import type { CategorySource, ItemCategory } from "@/lib/database.types";
import type { LlmItemRewriteProposal } from "@/lib/enrichment/llm/category-schemas";

export type ApplyItemRewriteProposalInput = {
  current: {
    title: string | null;
    subtitle: string | null;
    description: string | null;
    image_url: string | null;
    category: ItemCategory | null;
    category_confidence: number | null;
    category_source: CategorySource | null;
    structured: Record<string, unknown>;
    rawMetadata: Record<string, unknown>;
  };
  proposal: LlmItemRewriteProposal;
  providerMetadata: {
    provider: string;
    model?: string;
  };
  now: string;
};

export type ApplyItemRewriteProposalOutput = ApplyItemRewriteProposalInput["current"];

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Computes the structured metadata that should be stored after applying a
 * proposal. When the category changes, the proposal fully replaces structured
 * (old-category fields no longer apply). When the category is unchanged, the
 * proposal is merged over existing structured so a sparse or empty proposal can
 * never silently erase already-verified fields (isbn, authors, ratings, …).
 */
export function mergeProposedStructured(
  currentStructured: Record<string, unknown>,
  proposalStructured: Record<string, unknown> | undefined,
  categoryChanged: boolean,
): Record<string, unknown> {
  const proposed = proposalStructured ?? {};
  return categoryChanged ? { ...proposed } : { ...currentStructured, ...proposed };
}

export function applyItemRewriteProposal(
  input: ApplyItemRewriteProposalInput,
): ApplyItemRewriteProposalOutput {
  const categoryChanged = !sameValue(input.current.category, input.proposal.category);
  const next = {
    title: input.proposal.title ?? null,
    subtitle: input.proposal.subtitle ?? null,
    description: input.proposal.description ?? null,
    image_url: input.proposal.image_url ?? null,
    category: input.proposal.category,
    category_confidence: input.proposal.category_confidence,
    category_source: "llm" as const,
    structured: mergeProposedStructured(
      input.current.structured,
      input.proposal.structured,
      categoryChanged,
    ),
  };

  const acceptedFields: string[] = [];
  if (!sameValue(input.current.category, next.category)) acceptedFields.push("category");
  if (!sameValue(input.current.category_confidence, next.category_confidence)) {
    acceptedFields.push("category_confidence");
  }
  if (!sameValue(input.current.category_source, next.category_source)) acceptedFields.push("category_source");
  if (!sameValue(input.current.title, next.title)) acceptedFields.push("title");
  if (!sameValue(input.current.subtitle, next.subtitle)) acceptedFields.push("subtitle");
  if (!sameValue(input.current.description, next.description)) acceptedFields.push("description");
  if (!sameValue(input.current.image_url, next.image_url)) acceptedFields.push("image_url");
  if (!sameValue(input.current.structured, next.structured)) acceptedFields.push("structured");

  return {
    ...input.current,
    ...next,
    rawMetadata: {
      ...input.current.rawMetadata,
      ai_review: {
        ...input.providerMetadata,
        status: "accepted",
        accepted_fields: acceptedFields,
        proposal: input.proposal,
        accepted_at: input.now,
      },
    },
  };
}
