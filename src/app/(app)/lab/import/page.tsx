import { LabHeader } from "../LabHeader";
import { loadLabItems } from "../lab-data";
import { Importer } from "./Importer";

export default async function ImportPage() {
  const items = await loadLabItems();
  const library = items
    .filter((item) => item.category === "books" || item.category === "movies_and_tv")
    .map(({ id, title, authors, isbn, year, category, status }) => ({ id, title, authors, isbn, year, category, status }));
  return (
    <div className="mx-auto max-w-4xl">
      <LabHeader slug="import" />
      <Importer library={library} />
    </div>
  );
}
