"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Copy, UserPlus } from "lucide-react";
import { cancelInvite, inviteStaff, removeStaff } from "@/app/merchant/staff/actions";
import { Field, FormMessage } from "@/components/field";
import type { ActionResult } from "@/lib/validation/auth";

const inviteSchema = z.object({ email: z.email({ error: "Enter a valid email address." }) });
type InviteInput = z.infer<typeof inviteSchema>;

type Message = { tone: "error" | "success"; text: string } | null;
const toMessage = (r: ActionResult): Message =>
  r.ok ? { tone: "success", text: r.message ?? "Done." } : { tone: "error", text: r.error };

export function InviteStaffForm() {
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteInput>({ resolver: zodResolver(inviteSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit((values) => {
    setMessage(null);
    startTransition(async () => {
      const result = await inviteStaff(values);
      setMessage(toMessage(result));
      if (result.ok) reset();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3">
      <Field id="invite-email" label="Their email" error={errors.email?.message}>
        <input
          id="invite-email"
          type="email"
          autoComplete="off"
          className="field-input"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
      </Field>
      <button type="submit" className="btn justify-self-start" disabled={pending}>
        <UserPlus aria-hidden size={18} strokeWidth={1.5} />
        {pending ? "Creating invite" : "Create invite link"}
      </button>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
    </form>
  );
}

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className="grid gap-1">
      <button type="button" className="btn btn-secondary" onClick={copy}>
        <Copy aria-hidden size={18} strokeWidth={1.5} />
        {copied === "copied" ? "Link copied" : "Copy invite link"}
      </button>
      {copied === "failed" && (
        <p className="max-w-xs text-sm break-all" role="status">
          Copy this link by hand: {url}
        </p>
      )}
    </div>
  );
}

export function CancelInviteButton({ inviteId }: { inviteId: string }) {
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-1">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        onClick={() => startTransition(async () => setMessage(toMessage(await cancelInvite(inviteId))))}
      >
        Cancel invite
      </button>
      {message?.tone === "error" && <FormMessage tone="error">{message.text}</FormMessage>}
    </div>
  );
}

export function RemoveStaffButton({ memberId, name }: { memberId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
        Remove
      </button>
    );
  }
  return (
    <div className="grid gap-2">
      <p className="text-sm">Remove {name} from your team?</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn border-signal bg-signal"
          disabled={pending}
          onClick={() => startTransition(async () => setMessage(toMessage(await removeStaff(memberId))))}
        >
          Yes, remove
        </button>
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setConfirming(false)}>
          Keep
        </button>
      </div>
      {message?.tone === "error" && <FormMessage tone="error">{message.text}</FormMessage>}
    </div>
  );
}
