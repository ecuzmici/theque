import { LAB_IDEAS } from "./ideas";

/** Title block for one prototype, from the idea registry. */
export function LabHeader({ slug, children }: { slug: string; children?: React.ReactNode }) {
  const idea = LAB_IDEAS.find((entry) => entry.slug === slug);
  if (!idea) return null;
  return (
    <header className="mb-8">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Prototype {String(LAB_IDEAS.indexOf(idea) + 1).padStart(2, "0")} · {idea.cost}
      </p>
      <h1 className="mt-2 font-heading text-3xl tracking-tight text-foreground lg:text-4xl">{idea.title}</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-foreground/85">{idea.pitch}</p>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{idea.why}</p>
      {children}
    </header>
  );
}
