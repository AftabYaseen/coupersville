// Builds src/app/opengraph-image.jpg (1200 x 630) from public/town-sign.jpg: the sign as a postcard,
// on white with an ink outline, like the home page. Run again if the sign changes:
//   node scripts/make-og-image.mjs

import sharp from "sharp";

const W = 1200;
const H = 630;
const PAD = 24;
const INK = "#1B2A8F";

const photo = await sharp("public/town-sign.jpg")
  .resize(W - PAD * 2, H - PAD * 2, { fit: "cover", position: "centre" })
  .toBuffer();

const outline = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="${W - 6}" height="${H - 6}" fill="none" stroke="${INK}" stroke-width="6"/></svg>`,
);

await sharp({ create: { width: W, height: H, channels: 3, background: "#FFFFFF" } })
  .composite([{ input: photo, left: PAD, top: PAD }, { input: outline }])
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile("src/app/opengraph-image.jpg");

console.log("Wrote src/app/opengraph-image.jpg");
