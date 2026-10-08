import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { checkImageFile, IMAGE_EXTENSIONS, type ImageBucket } from "@/lib/storage";

// Uploads go straight from the browser to storage, which only checks the declared type.
// Before an upload is attached to a record, read its bytes; delete it if it is not a real image.
export async function verifyStoredImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: ImageBucket,
  path: string,
): Promise<boolean> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return false;

  const check = await checkImageFile(data);
  const ok = check.ok && path.endsWith(`.${IMAGE_EXTENSIONS[check.type]}`);
  if (!ok) await supabase.storage.from(bucket).remove([path]);
  return ok;
}
