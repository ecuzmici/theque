import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { WrappedView } from "@/components/wrapped/WrappedView";
import { createClient } from "@/lib/supabase/server";
import { fetchWrappedData } from "@/lib/wrapped/wrapped-stats";

export const metadata: Metadata = {
  title: "Wrapped",
};

export default async function WrappedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const data = await fetchWrappedData(supabase);

  return <WrappedView data={data} />;
}
