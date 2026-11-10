import { z } from "zod";

export const CONTACT_ROLES = ["Shopper", "Business", "Other"] as const;
export const CONTACT_TOPICS = ["Coupon question", "Business membership", "Billing", "Technical support", "Report an issue", "Other"] as const;

export const contactSchema = z.object({
  name: z.string().trim().min(1, { error: "Enter your name." }).max(100, { error: "Use 100 characters or fewer." }),
  email: z.email({ error: "Enter a valid email address." }).trim().max(254),
  role: z.enum(CONTACT_ROLES, { error: "Choose shopper, business or other." }),
  topic: z.enum(CONTACT_TOPICS, { error: "Choose a topic." }),
  message: z.string().trim().min(10, { error: "Write a little more, at least 10 characters." }).max(4000, { error: "Use 4,000 characters or fewer." }),
  // Hidden from people; a bot that fills it in is ignored.
  website: z.string().max(500).optional(),
});
export type ContactInput = z.input<typeof contactSchema>;
