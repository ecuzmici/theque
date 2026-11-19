import { LabHeader } from "../LabHeader";
import { loadLabItems } from "../lab-data";
import { Scanner } from "./Scanner";

export default async function ScanPage() {
  const items = await loadLabItems();
  const books = items
    .filter((item) => item.category === "books")
    .map(({ id, title, authors, isbn, status, rating, cover, hasFile }) => ({ id, title, authors, isbn, status, rating, cover, hasFile }));
  return (
    <div className="mx-auto max-w-2xl">
      <LabHeader slug="scan" />
      <Scanner books={books} />
    </div>
  );
}
