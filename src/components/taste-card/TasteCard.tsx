"use client";

import Link from "next/link";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TasteCardSummary } from "@/lib/taste-card/taste-card-data";

// Self-contained palette so the card screenshots identically in light or dark theme.
const INK = "#0c0a09";
const PAPER = "#fafaf9";
const MUTED = "#a8a29e";
const FAINT = "#57534e";
const ACCENT = "#d97706";

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Draws the card onto an off-DOM canvas and triggers a PNG download. No deps. */
function downloadCardImage(summary: TasteCardSummary) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const padX = 90;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  // Palette band across the top.
  const palette = summary.palette.length ? summary.palette : [ACCENT];
  const seg = W / palette.length;
  palette.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(i * seg, 0, Math.ceil(seg), 26);
  });

  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = ACCENT;
  ctx.font = "600 58px Georgia, 'Times New Roman', serif";
  ctx.fillText("thèque", padX, 190);

  ctx.fillStyle = MUTED;
  ctx.font = "400 30px system-ui, -apple-system, sans-serif";
  ctx.fillText("my taste", padX, 240);

  ctx.fillStyle = PAPER;
  ctx.font = "700 230px system-ui, -apple-system, sans-serif";
  ctx.fillText(String(summary.total), padX, 520);

  ctx.fillStyle = MUTED;
  ctx.font = "400 42px system-ui, -apple-system, sans-serif";
  ctx.fillText("things saved", padX, 580);

  ctx.fillStyle = PAPER;
  ctx.font = "500 44px system-ui, -apple-system, sans-serif";
  ctx.fillText(`${summary.done} finished · ${summary.completionPct}% done`, padX, 680);

  let y = 810;
  ctx.fillStyle = MUTED;
  ctx.font = "500 30px system-ui, -apple-system, sans-serif";
  ctx.fillText("TOP SHELVES", padX, y);
  y += 62;
  ctx.fillStyle = PAPER;
  ctx.font = "500 46px system-ui, -apple-system, sans-serif";
  for (const shelf of summary.topShelves) {
    ctx.fillText(`${shelf.label}  ·  ${shelf.count}`, padX, y);
    y += 66;
  }

  if (summary.standout) {
    y += 34;
    ctx.fillStyle = MUTED;
    ctx.font = "500 30px system-ui, -apple-system, sans-serif";
    ctx.fillText("LOVED", padX, y);
    y += 56;
    ctx.fillStyle = ACCENT;
    ctx.font = "600 46px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${truncate(summary.standout.title, 22)}  ★${summary.standout.rating}`, padX, y);
  }

  ctx.fillStyle = FAINT;
  ctx.font = "400 34px system-ui, -apple-system, sans-serif";
  ctx.fillText("theque.app", padX, H - 80);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "theque-taste-card.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function EmptyCard() {
  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-[color:var(--ks-border)] bg-[color:var(--ks-surface)] p-8 text-center shadow-[var(--ks-shadow-md)]">
      <p className="font-heading text-xl text-foreground">No taste card yet</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Save a few things and your card fills in with your palette, shelves, and a
        standout pick.
      </p>
      <Button nativeButton={false} className="mt-5" render={<Link href="/add" />}>
        Add your first link
      </Button>
    </div>
  );
}

export function TasteCard({ summary }: { summary: TasteCardSummary }) {
  if (summary.isEmpty) {
    return <EmptyCard />;
  }

  const palette = summary.palette.length ? summary.palette : [ACCENT];

  return (
    <div className="flex flex-col items-center gap-5">
      {/* The shareable artifact: a fixed-palette card that reads the same anywhere. */}
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl shadow-[var(--ks-shadow-md)]"
        style={{ backgroundColor: INK, color: PAPER }}
      >
        <div className="flex h-2.5 w-full">
          {palette.map((color, i) => (
            <div key={`${color}-${i}`} className="h-full flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>

        <div className="px-7 pb-8 pt-6">
          <div className="flex items-baseline justify-between">
            <span className="font-heading text-2xl" style={{ color: ACCENT }}>
              thèque
            </span>
            <span className="text-xs uppercase tracking-widest" style={{ color: MUTED }}>
              my taste
            </span>
          </div>

          <div className="mt-7">
            <div className="text-7xl font-bold leading-none" style={{ color: PAPER }}>
              {summary.total}
            </div>
            <div className="mt-1 text-sm" style={{ color: MUTED }}>
              things saved
            </div>
          </div>

          <div className="mt-4 text-base font-medium" style={{ color: PAPER }}>
            {summary.done} finished · {summary.completionPct}% done
          </div>

          {summary.topShelves.length > 0 && (
            <div className="mt-7">
              <div className="text-xs uppercase tracking-widest" style={{ color: MUTED }}>
                Top shelves
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {summary.topShelves.map((shelf) => (
                  <span
                    key={shelf.label}
                    className="rounded-full px-3 py-1 text-sm"
                    style={{ backgroundColor: "rgba(217,119,6,0.16)", color: PAPER }}
                  >
                    {shelf.label} · {shelf.count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {summary.standout && (
            <div className="mt-6">
              <div className="text-xs uppercase tracking-widest" style={{ color: MUTED }}>
                Loved
              </div>
              <div className="mt-1 text-base font-semibold" style={{ color: ACCENT }}>
                {truncate(summary.standout.title, 32)} ★{summary.standout.rating}
              </div>
            </div>
          )}

          <div className="mt-8 text-sm" style={{ color: FAINT }}>
            theque.app
          </div>
        </div>
      </div>

      <Button onClick={() => downloadCardImage(summary)} variant="outline">
        <Download className="size-4" />
        Download image
      </Button>
    </div>
  );
}
