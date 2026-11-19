import { LabHeader } from "../LabHeader";
import { loadLabItems } from "../lab-data";
import { ReaderSync } from "./ReaderSync";

export default async function ReaderPage() {
  const items = await loadLabItems();
  const books = items
    .filter((item) => item.category === "books")
    .map(({ id, title, authors, status, doneAt, cover, hasFile }) => ({ id, title, authors, status, doneAt, cover, hasFile }));
  return (
    <div className="mx-auto max-w-4xl">
      <LabHeader slug="reader" />
      <ReaderSync books={books} />
    </div>
  );
}
