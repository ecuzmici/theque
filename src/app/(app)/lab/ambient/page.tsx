import { LabHeader } from "../LabHeader";
import { loadLabItems } from "../lab-data";
import { Ambient } from "./Ambient";

export default async function AmbientPage() {
  const items = await loadLabItems();
  const covers = items.filter(
    (item) => item.coverFull && (item.category === "books" || item.category === "movies_and_tv"),
  );
  return (
    <div className="mx-auto max-w-6xl">
      <LabHeader slug="ambient" />
      <Ambient items={covers} />
    </div>
  );
}
