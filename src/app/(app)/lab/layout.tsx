import { notFound } from "next/navigation";

import { LabNav } from "./LabNav";

/**
 * The idea lab is a local prototype space. It never ships: a production build
 * answers 404 for every lab route.
 */
export default function LabLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="pb-24">
      <LabNav />
      {children}
    </div>
  );
}
