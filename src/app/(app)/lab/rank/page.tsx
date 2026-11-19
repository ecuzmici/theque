import { LabHeader } from "../LabHeader";
import { loadLabItems } from "../lab-data";
import { HeadToHead } from "./HeadToHead";

export default async function RankPage() {
  const items = await loadLabItems();
  const rated = items.filter(
    (item) =>
      item.status === "done" &&
      (item.category === "books" || item.category === "movies_and_tv") &&
      (item.rating ?? 0) >= 4,
  );
  return (
    <div className="mx-auto max-w-3xl">
      <LabHeader slug="rank" />
      <HeadToHead items={rated} />
    </div>
  );
}
