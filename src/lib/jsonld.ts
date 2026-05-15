export type JsonLdNode = Record<string, unknown>;

export function flattenJsonLd(raw: unknown): JsonLdNode[] {
  const out: JsonLdNode[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const obj = node as JsonLdNode;
    out.push(obj);
    const graph = obj["@graph"];
    if (Array.isArray(graph)) graph.forEach(walk);
  }

  walk(raw);
  return out;
}

export function typesOf(node: JsonLdNode): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}
