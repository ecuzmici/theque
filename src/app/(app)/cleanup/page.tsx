import { SpringCleaning } from "@/components/cleanup/SpringCleaning";
import { loadCleanupPass } from "@/lib/cleanup/load";

/** Spring cleaning: one forgotten item at a time, keep it or let it go. */
export default async function SpringCleaningPage() {
  const { items, now } = await loadCleanupPass();
  return <SpringCleaning items={items} now={now} />;
}
