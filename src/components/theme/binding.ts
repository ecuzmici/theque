/**
 * Library "binding" themes — a personalization axis ORTHOGONAL to light/dark.
 *
 * A binding re-skins the accent family (`--ks-accent` / `--ks-accent-hover` /
 * `--ks-accent-soft` / `--ks-ring`, see globals.css) the way a clothbound book
 * is bound in a particular cloth. It is applied as a `data-binding` attribute on
 * <html> and persisted in localStorage. The DEFAULT ("amber") sets NO attribute,
 * so the default look is pixel-identical to before this feature existed.
 *
 * The `swatch` is the light-mode accent, used for the picker preview dot. Every
 * accent is deep enough to carry white foreground text in light mode and the
 * `.dark` block re-skins each to a lighter tint for dark backgrounds.
 */
export const BINDINGS = [
  { id: "amber", label: "Amber", swatch: "#b45309" },
  { id: "leather", label: "Leather", swatch: "#6f4518" },
  { id: "claret", label: "Claret", swatch: "#9b2242" },
  { id: "forest", label: "Forest", swatch: "#2f6b46" },
  { id: "midnight", label: "Midnight", swatch: "#34508c" },
  { id: "plum", label: "Plum", swatch: "#6d3a73" },
] as const;

export type Binding = (typeof BINDINGS)[number]["id"];

export const DEFAULT_BINDING: Binding = "amber";

/** localStorage key. Kept in sync with the no-flash init script in app/layout.tsx. */
export const BINDING_STORAGE_KEY = "theque-binding";

const BINDING_IDS: readonly string[] = BINDINGS.map((b) => b.id);

export function isBinding(value: unknown): value is Binding {
  return typeof value === "string" && BINDING_IDS.includes(value);
}

/** Coerce any stored/unknown value to a valid binding, falling back to the default. */
export function normalizeBinding(value: unknown): Binding {
  return isBinding(value) ? value : DEFAULT_BINDING;
}
