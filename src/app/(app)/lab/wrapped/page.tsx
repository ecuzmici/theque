import { LabHeader } from "../LabHeader";
import { loadLabItems } from "../lab-data";
import { Wrapped } from "./Wrapped";

export default async function WrappedPage() {
  const items = await loadLabItems();
  const year = new Date().getFullYear();
  const finished = items.filter((item) => item.status === "done" && item.doneAt?.startsWith(String(year)));
  return (
    <div className="mx-auto max-w-3xl">
      <LabHeader slug="wrapped" />
      <Wrapped year={year} items={finished} />
    </div>
  );
}
