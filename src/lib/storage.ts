export const LOGO_BUCKET = "logos";
export const COUPON_IMAGE_BUCKET = "coupon-images";
export type ImageBucket = typeof LOGO_BUCKET | typeof COUPON_IMAGE_BUCKET;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_ERROR = "Please upload a JPG, PNG or WebP image under 5 MB.";

export const IMAGE_EXTENSIONS: Record<ImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

// Identifies the format from the file's signature bytes. Extensions and browser-reported
// types are guesses from the filename, so they are never trusted.
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function checkImageFile(file: Blob): Promise<{ ok: true; type: ImageType } | { ok: false; error: string }> {
  if (file.size === 0 || file.size > IMAGE_MAX_BYTES) return { ok: false, error: IMAGE_ERROR };
  const type = sniffImageType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  return type ? { ok: true, type } : { ok: false, error: IMAGE_ERROR };
}

export function publicImageUrl(bucket: ImageBucket, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${encoded}`;
}

// Uploads live under "<business_id>/<random>.<ext>"; storage RLS checks the folder.
export function isBusinessImagePath(path: string, businessId: string): boolean {
  return path.startsWith(`${businessId}/`) && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path);
}
