import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Minified SVG for data-URI render; matches `app/icon.svg`. */
const ICON_MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><clipPath id="a"><rect width="32" height="32" rx="7"/></clipPath></defs><g clip-path="url(#a)"><path fill="#6b6b66" d="M0 0h11L0 11V0Z"/><path fill="#fcfcfb" d="M11 0h21v14L14 32H0V11L11 0Z"/><path fill="#2433ff" d="M32 32V14L14 32H32z"/></g></svg>';

/** PNG apple touch icon — rasterizes the same tri-diagonal mark as `icon.svg`. */
export default function AppleIcon() {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON_MARK_SVG)}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fcfcfb",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- OG route embeds rasterized SVG via data URL */}
        <img src={src} width={180} height={180} alt="" />
      </div>
    ),
    { ...size },
  );
}
