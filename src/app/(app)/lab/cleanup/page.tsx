import { LabHeader } from "../LabHeader";
import { labNow, loadLabItems } from "../lab-data";
import { Cleanup } from "./Cleanup";

export default async function CleanupPage() {
  const items = await loadLabItems();
  const backlog = items
    .filter((item) => item.status === "want" && (item.category === "books" || item.category === "movies_and_tv"))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <div className="mx-auto max-w-2xl">
      <LabHeader slug="cleanup" />
      <Cleanup items={backlog} now={labNow()} />
    </div>
  );
}
