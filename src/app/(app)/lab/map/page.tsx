import { LabHeader } from "../LabHeader";
import { loadLabItems } from "../lab-data";
import { TasteMap } from "./TasteMap";

export default async function MapPage() {
  const items = await loadLabItems();
  const placed = items.filter(
    (item) => (item.category === "books" || item.category === "movies_and_tv") && item.year,
  );
  return (
    <div className="mx-auto max-w-6xl">
      <LabHeader slug="map" />
      <TasteMap items={placed} />
    </div>
  );
}
