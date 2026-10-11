import { redirect } from "next/navigation";

import { searchRedirectHref } from "@/lib/library-search";

/** Search lives on the library now. `/search?q=x` goes to `/library?q=x`. */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { q } = await searchParams;
  redirect(searchRedirectHref(q));
}
