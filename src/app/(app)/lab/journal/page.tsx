import { LabHeader } from "../LabHeader";
import { labNow, loadLabItems } from "../lab-data";
import { Journal } from "./Journal";

export default async function JournalPage() {
  const items = await loadLabItems();
  const finished = items.filter((item) => item.status === "done" && item.doneAt);
  return (
    <div className="mx-auto max-w-4xl">
      <LabHeader slug="journal" />
      <Journal items={finished} now={labNow()} />
    </div>
  );
}
