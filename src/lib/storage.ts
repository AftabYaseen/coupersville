export const LOGO_BUCKET = "logos";
export const COUPON_IMAGE_BUCKET = "coupon-images";
export type ImageBucket = typeof LOGO_BUCKET | typeof COUPON_IMAGE_BUCKET;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const IMAGE_EXTENSIONS: Record<(typeof IMAGE_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function publicImageUrl(bucket: ImageBucket, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${encoded}`;
}

// Uploads live under "<business_id>/<random>.<ext>"; storage RLS checks the folder.
export function isBusinessImagePath(path: string, businessId: string): boolean {
  return path.startsWith(`${businessId}/`) && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path);
}
