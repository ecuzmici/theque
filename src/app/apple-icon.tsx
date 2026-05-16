import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Index card mark (variant D) — matches `app/icon.svg`. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf8f5",
        }}
      >
        <div
          style={{
            width: 118,
            height: 112,
            background: "#fffefb",
            border: "3px solid #d6d3d1",
            borderRadius: 16,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 22,
              top: 36,
              width: 74,
              height: 5,
              background: "#78716c",
              borderRadius: 3,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 22,
              top: 52,
              width: 54,
              height: 5,
              background: "#78716c",
              borderRadius: 3,
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 18,
              top: 22,
              width: 18,
              height: 18,
              borderRadius: 999,
              background: "#b45309",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
