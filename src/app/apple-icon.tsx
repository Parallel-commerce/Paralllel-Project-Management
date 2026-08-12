import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

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
          background: "#0F1117",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
            marginTop: 8,
          }}
        >
          <span
            style={{
              color: "#FFFFFF",
              fontSize: 128,
              fontWeight: 600,
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}
          >
            p
          </span>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: "#E8420A",
              marginBottom: 16,
              marginLeft: 4,
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
