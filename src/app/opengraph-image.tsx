import { ImageResponse } from "next/og";

export const alt = "thèque — your private taste library";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SWATCHES = [
  "linear-gradient(135deg, rgba(120,53,15,0.7), rgba(28,25,23,0.6))",
  "linear-gradient(135deg, rgba(76,29,149,0.7), rgba(28,25,23,0.6))",
  "linear-gradient(135deg, rgba(159,18,57,0.7), rgba(28,25,23,0.6))",
  "linear-gradient(135deg, rgba(19,78,74,0.7), rgba(28,25,23,0.6))",
  "linear-gradient(135deg, rgba(68,64,60,0.7), rgba(28,25,23,0.6))",
];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0a09",
          color: "#faf8f5",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            fontSize: 38,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#a8a29e",
          }}
        >
          Private taste library
        </div>
        <div style={{ fontSize: 180, lineHeight: 1, marginTop: 12 }}>thèque</div>
        <div
          style={{
            fontSize: 36,
            color: "#d6d3d1",
            marginTop: 28,
            maxWidth: 820,
            textAlign: "center",
          }}
        >
          Save what you&apos;ll love later. Every link becomes a card on a shelf.
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 56 }}>
          {SWATCHES.map((bg, i) => (
            <div
              key={i}
              style={{
                width: 96,
                height: i % 2 === 0 ? 132 : 112,
                borderRadius: 12,
                backgroundImage: bg,
                border: "1px solid rgba(250,248,245,0.12)",
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
