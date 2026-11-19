import { NextResponse } from "next/server";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { normalizeIsbn } from "@/lib/isbn";

/**
 * Idea-lab only: look up one ISBN on Google Books, then Open Library. Answers
 * 404 in a production build. Reads nothing from the library and writes
 * nothing.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  if (!(await getSessionUserOrNull())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const isbn = normalizeIsbn(new URL(request.url).searchParams.get("isbn"));
  if (!isbn) return NextResponse.json({ error: "invalid_isbn" }, { status: 400 });

  const google = new URL("https://www.googleapis.com/books/v1/volumes");
  google.searchParams.set("q", `isbn:${isbn}`);
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  if (key) google.searchParams.set("key", key);

  try {
    const res = await fetch(google, { signal: AbortSignal.timeout(8000) });
    const body = res.ok
      ? ((await res.json()) as {
          items?: Array<{
            volumeInfo?: {
              title?: string;
              subtitle?: string;
              authors?: string[];
              publishedDate?: string;
              pageCount?: number;
              description?: string;
              imageLinks?: { thumbnail?: string };
            };
          }>;
        })
      : null;
    const info = body?.items?.[0]?.volumeInfo;
    if (info?.title) {
      return NextResponse.json({
        isbn,
        title: info.title,
        authors: info.authors ?? [],
        year: info.publishedDate?.slice(0, 4) ?? null,
        pages: info.pageCount ?? null,
        description: info.description ?? null,
        cover: info.imageLinks?.thumbnail?.replace(/^http:/, "https:") ?? null,
      });
    }
  } catch {
    /* fall through to Open Library */
  }

  try {
    const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const ed = (await res.json()) as { title?: string; number_of_pages?: number; publish_date?: string; covers?: number[] };
      return NextResponse.json({
        isbn,
        title: ed.title ?? "Unknown title",
        authors: [],
        year: ed.publish_date?.match(/\d{4}/)?.[0] ?? null,
        pages: ed.number_of_pages ?? null,
        description: null,
        cover: ed.covers?.[0] ? `https://covers.openlibrary.org/b/id/${ed.covers[0]}-M.jpg` : null,
      });
    }
  } catch {
    /* no match */
  }
  return NextResponse.json({ isbn, title: null }, { status: 404 });
}
