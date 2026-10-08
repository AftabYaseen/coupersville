"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { checkImageFile, IMAGE_EXTENSIONS, publicImageUrl, type ImageBucket } from "@/lib/storage";

const ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

type Props = {
  label: string;
  hint?: string;
  bucket: ImageBucket;
  businessId: string;
  value: string | null;
  onChange: (path: string | null) => void | Promise<void>;
  shape?: "square" | "wide";
  disabled?: boolean;
};

export function ImageUpload({ label, hint, bucket, businessId, value, onChange, shape = "wide", disabled }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    // The type is read from the file's bytes, so a renamed PDF is caught here.
    const check = await checkImageFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setUploading(true);
    const path = `${businessId}/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[check.type]}`;
    const { error: uploadError } = await createClient()
      .storage.from(bucket)
      .upload(path, file, { contentType: check.type, upsert: false });

    if (uploadError) {
      setUploading(false);
      setError("The upload did not finish. Check your connection and try again.");
      return;
    }
    await onChange(path);
    setUploading(false);
  }

  const previewBox = shape === "square" ? "aspect-square w-32" : "aspect-[16/9] w-full max-w-sm";

  return (
    <div>
      <p className="field-label" id={`${inputId}-label`}>
        {label}
      </p>
      {value ? (
        <div className={`relative overflow-hidden rounded-sm border-[1.5px] border-ink bg-white ${previewBox}`}>
          <Image
            src={publicImageUrl(bucket, value)}
            alt=""
            fill
            sizes={shape === "square" ? "128px" : "384px"}
            className="object-cover"
          />
        </div>
      ) : (
        <div
          className={`flex items-center justify-center rounded-sm border-[1.5px] border-dashed border-ink bg-white text-sm ${previewBox}`}
        >
          No image yet
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-labelledby={`${inputId}-label`}
          disabled={disabled || uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus aria-hidden size={18} strokeWidth={1.5} />
          {uploading ? "Uploading" : value ? "Replace image" : "Upload image"}
        </button>
        {value && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={disabled || uploading}
            onClick={() => void onChange(null)}
          >
            <Trash2 aria-hidden size={18} strokeWidth={1.5} />
            Remove image
          </button>
        )}
      </div>
      {hint && !error && <p className="mt-1.5 text-sm">{hint}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
