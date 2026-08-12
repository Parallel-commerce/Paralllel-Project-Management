import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
            marginTop: 2,
          }}
        >
          <span
            style={{
              color: "#FFFFFF",
              fontSize: 26,
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
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "#E8420A",
              marginBottom: 3,
              marginLeft: 1,
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
