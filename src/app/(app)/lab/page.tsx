import { Link } from "next-view-transitions";

import { LAB_IDEAS, MORE_IDEAS } from "./ideas";

const EFFORT_LABEL = { S: "Small build", M: "Medium build", L: "Large build" } as const;

export default function LabIndexPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Local only · not in production
        </p>
        <h1 className="mt-2 font-heading text-4xl tracking-tight text-foreground">Idea lab</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-foreground/80">
          Ten things thèque could do next, built as working prototypes on your real library. Nothing
          here writes to your data. Open one, play with it, and keep the ones you would use.
        </p>
      </header>

      <ol className="mt-10 space-y-3">
        {LAB_IDEAS.map((idea, index) => (
          <li key={idea.slug}>
            <Link
              href={`/lab/${idea.slug}`}
              className="group block rounded-2xl border border-border bg-card/60 p-5 transition-colors hover:border-foreground/30 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <div className="flex items-baseline gap-4">
                <span className="w-6 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-heading text-xl tracking-tight text-foreground">
                    {idea.title}
                    <span
                      aria-hidden
                      className="ml-2 inline-block text-muted-foreground transition-transform group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/85">{idea.pitch}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{idea.why}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      {EFFORT_LABEL[idea.effort]}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{idea.cost}</span>
                  </div>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>

      <section className="mt-14" aria-labelledby="more-ideas">
        <h2 id="more-ideas" className="font-heading text-2xl tracking-tight text-foreground">
          Not built yet
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Ranked. Each one is free or costs cents.</p>
        <ul className="mt-5 divide-y divide-border rounded-2xl border border-border">
          {MORE_IDEAS.map((idea) => (
            <li key={idea.title} className="px-5 py-4">
              <p className="text-sm font-medium text-foreground">{idea.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{idea.pitch}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
