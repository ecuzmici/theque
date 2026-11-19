import { LabHeader } from "../LabHeader";
import { loadLabItems } from "../lab-data";
import { Bookcase } from "./Bookcase";

export default async function BookcasePage() {
  const items = await loadLabItems();
  const books = items.filter((item) => item.category === "books");
  return (
    <div className="mx-auto max-w-5xl">
      <LabHeader slug="bookcase" />
      <Bookcase books={books} />
    </div>
  );
}
