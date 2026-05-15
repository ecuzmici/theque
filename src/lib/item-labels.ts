import type { ItemCategory, ItemStatus } from "@/lib/database.types";

export const STATUS_LABELS: Record<ItemStatus, string> = {
  inbox: "Inbox",
  want: "Want",
  planned: "Planned",
  done: "Done",
  dismissed: "Dismissed",
};

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  books: "Books",
  movies_and_tv: "Movies & TV",
  restaurants: "Restaurants",
  products: "Products",
  gifts: "Gifts",
  travel: "Travel",
  recipes: "Recipes",
  articles: "Articles",
};

export function formatStatus(status: ItemStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatCategory(category: ItemCategory | null): string {
  if (!category) return "Uncategorized";
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}
