import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// App icons: "Coupersville" in Archivo (condensed, extra bold) on ink blue with a marigold rule.
// Rendered once at build time. The font file is a subset holding only the letters used here.

const font = readFile(join(process.cwd(), "src/assets/archivo-icon.ttf"));

type Variant = "word" | "letter" | "maskable";

export async function brandIcon(size: number, variant: Variant = "word") {
  // Maskable icons get cropped to a circle, so the word stays inside the middle 60 percent.
  const wordWidth = variant === "maskable" ? 0.6 : 0.86;
  const fontSize = variant === "letter" ? size * 0.78 : (size * wordWidth) / 5.1;

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
          background: "#1B2A8F",
          color: "#FFFFFF",
          fontFamily: "Archivo",
          fontWeight: 800,
          fontSize,
          lineHeight: 1,
          borderRadius: variant === "letter" && size <= 64 ? size * 0.14 : 0,
        }}
      >
        <span style={{ marginTop: variant === "letter" ? size * 0.04 : 0 }}>{variant === "letter" ? "C" : "Coupersville"}</span>
        {variant !== "letter" && (
          <span style={{ width: fontSize * 2.2, height: Math.max(2, size * 0.022), marginTop: fontSize * 0.32, background: "#FFB81C" }} />
        )}
      </div>
    ),
    {
      width: size,
      height: size,
      fonts: [{ name: "Archivo", data: await font, weight: 800, style: "normal" }],
    },
  );
}
