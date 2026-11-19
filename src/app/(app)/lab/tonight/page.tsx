import { LabHeader } from "../LabHeader";
import { labNow, loadLabItems } from "../lab-data";
import { LAB_REGIONS, tmdbRefForUrl, watchProviders, type RegionProviders } from "../lab-tmdb";
import { Tonight } from "./Tonight";

export default async function TonightPage() {
  const items = await loadLabItems();
  const backlog = items.filter((item) => item.status !== "done" && (item.category === "movies_and_tv" || item.category === "books"));
  const films = backlog.filter((item) => item.category === "movies_and_tv");

  // One TMDB lookup per film, in parallel. Each response is cached for a day.
  const providers: Record<string, Record<string, RegionProviders>> = {};
  const kinds: Record<string, "movie" | "tv"> = {};
  await Promise.all(
    films.map(async (film) => {
      const ref = await tmdbRefForUrl(film.url);
      if (!ref) return;
      kinds[film.id] = ref.type;
      providers[film.id] = await watchProviders(ref);
    }),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <LabHeader slug="tonight" />
      <Tonight items={backlog} providers={providers} kinds={kinds} regions={[...LAB_REGIONS]} now={labNow()} />
    </div>
  );
}
