/**
 * Extension shelf-hint options — shared source of truth for popup.ts.
 *
 * Keep this list in sync with EXTENSION_CATEGORY_HINTS in
 * src/lib/capture/category-hint.ts (app-side validation).
 *
 * category values must be valid ItemCategory enum values.
 * label is the user-facing shelf name shown in the dropdown.
 */
export const CATEGORY_HINT_OPTIONS = [
    { value: "books", label: "Books" },
    { value: "movies_and_tv", label: "Watch" },
    { value: "videos", label: "Videos" },
    { value: "music", label: "Listen" },
    { value: "restaurants", label: "Eat" },
    { value: "products", label: "Shop" },
    { value: "travel", label: "Travel" },
    { value: "articles", label: "Read" },
    { value: "recipes", label: "Cook" },
    { value: "apps", label: "Tools" },
];
