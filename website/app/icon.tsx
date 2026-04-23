import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

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
          backgroundColor: "#0e5a2a",
          borderRadius: "14px",
          color: "#ffffff",
          fontSize: 44,
          fontWeight: 800,
          lineHeight: 1,
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        h
      </div>
    ),
    {
      ...size,
    },
  );
}
