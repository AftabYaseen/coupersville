// Builds the brand files from the client's rebrand package (docs/coupersville-rebrand/, 2026-11-13).
// Run again if the package's logos change:
//   node scripts/make-brand-assets.mjs
//
// - public/brand/: the logo lockups the site and emails use.
// - src/app/icon.svg, icon1.png, apple-icon.png: browser and device icons.
// - public/icons/: the home screen icons listed in the web app manifest (any and maskable).
// - src/app/opengraph-image.png: 1200 x 630 link preview, the logo beside the Main Street illustration.
//
// Uses sharp only. The package's Python tools are not run.

import { copyFile, mkdir, readFile } from "node:fs/promises";
import sharp from "sharp";

const PKG = "docs/coupersville-rebrand/coupersville-rebrand";
const LOGO = `${PKG}/logo`;

await mkdir("public/brand", { recursive: true });
await mkdir("public/icons", { recursive: true });

for (const file of [
  "coupersville-logo-horizontal.svg",
  "coupersville-logo-horizontal.png",
  "coupersville-logo-reversed-transparent.svg",
  "coupersville-mark.svg",
]) {
  await copyFile(`${LOGO}/${file}`, `public/brand/${file}`);
}
// The reversed logo as a PNG on transparent, for emails with a dark header (some mail apps drop SVG).
await sharp(`${LOGO}/coupersville-logo-reversed-transparent.svg`, { density: 300 }).resize({ width: 714 }).png().toFile("public/brand/coupersville-logo-reversed.png");

await copyFile(`${LOGO}/favicon.svg`, "src/app/icon.svg");
await copyFile(`${LOGO}/favicon-32.png`, "src/app/icon1.png");
await copyFile(`${LOGO}/apple-touch-icon-180.png`, "src/app/apple-icon.png");

const iconSvg = await readFile(`${LOGO}/coupersville-icon.svg`, "utf8");
for (const size of [192, 512]) {
  await sharp(Buffer.from(iconSvg), { density: 300 }).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}
// Maskable: full-bleed evergreen with the mark inside the middle 60 percent, since launchers crop it.
const maskable = iconSvg
  .replace(/<rect width="512" height="512" rx="112"/, '<rect width="512" height="512" rx="0"')
  .replace(/translate\(76 72\) scale\(3\.6\)/, "translate(106 109) scale(3)");
await sharp(Buffer.from(maskable), { density: 300 }).resize(512, 512).png().toFile("public/icons/maskable-512.png");

// Link preview: cream paper, the horizontal logo on the left, the illustrated street on the right.
// The illustration is taken from the package's reference page without its text and sample tickets.
const html = await readFile(`${PKG}/index.html`, "utf8");
const art = html.slice(html.indexOf('<svg viewBox="0 0 560 450">'), html.indexOf("</svg>", html.indexOf('<svg viewBox="0 0 560 450">')) + 6);
const street = art
  .replace(/<!-- town sign -->\s*<g[\s\S]*?<\/g>/, "")
  .replace(/<text[\s\S]*?<\/text>/g, "")
  .replace(/<!-- floating coupon tickets[\s\S]*?(?=<\/svg>)/, "")
  .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
const W = 1200;
const H = 630;
const streetPng = await sharp(Buffer.from(street), { density: 200 }).resize({ height: 520 }).png().toBuffer();
const logoPng = await sharp(`${LOGO}/coupersville-logo-horizontal.svg`, { density: 300 }).resize({ width: 560 }).png().toBuffer();
const streetMeta = await sharp(streetPng).metadata();
const logoMeta = await sharp(logoPng).metadata();
await sharp({ create: { width: W, height: H, channels: 4, background: "#FFF8EC" } })
  .composite([
    { input: logoPng, left: 60, top: Math.round((H - logoMeta.height) / 2) },
    { input: streetPng, left: W - streetMeta.width - 30, top: Math.round((H - streetMeta.height) / 2) },
  ])
  .png({ compressionLevel: 9 })
  .toFile("src/app/opengraph-image.png");

console.log("Wrote public/brand, public/icons, src/app/icon.svg, icon1.png, apple-icon.png and opengraph-image.png");
