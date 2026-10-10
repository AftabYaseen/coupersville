"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction } from "@/lib/admin";
import { categorySchema } from "@/lib/validation/admin";
import type { ActionResult } from "@/lib/validation/auth";
import type { PostgrestError } from "@supabase/supabase-js";

const INVALID: ActionResult = { ok: false, error: "Some details are missing or invalid. Check the form and try again." };
const NOT_FOUND: ActionResult = { ok: false, error: "That category could not be found." };

function writeError(error: PostgrestError): ActionResult {
  if (error.code === "23505") return { ok: false, error: "Another category already uses that web address name. Choose a different one." };
  return { ok: false, error: "We could not save this category. Try again in a moment." };
}

export async function createCategory(input: unknown): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return INVALID;

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const { data: last } = await ctx.supabase
    .from("categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { name, slug, shopLabel, tint } = parsed.data;
  const { error } = await ctx.supabase
    .from("categories")
    .insert({ name, slug, shop_label: shopLabel, stock_tint: tint, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) return writeError(error);

  refresh();
  return { ok: true, message: `${name} is added to the end of Main Street.` };
}

export async function updateCategory(categoryId: unknown, input: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(categoryId);
  const parsed = categorySchema.safeParse(input);
  if (!id.success) return NOT_FOUND;
  if (!parsed.success) return INVALID;

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const { name, slug, shopLabel, tint } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("categories")
    .update({ name, slug, shop_label: shopLabel, stock_tint: tint })
    .eq("id", id.data)
    .select("id");
  if (error) return writeError(error);
  if (!data?.length) return NOT_FOUND;

  refresh();
  return { ok: true, message: `${name} is saved.` };
}

// Swaps places with the neighbour above or below.
export async function moveCategory(categoryId: unknown, directionInput: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(categoryId);
  const direction = z.enum(["up", "down"]).safeParse(directionInput);
  if (!id.success || !direction.success) return NOT_FOUND;

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const { data: all } = await ctx.supabase.from("categories").select("id, sort_order").order("sort_order").order("name");
  const list = all ?? [];
  const index = list.findIndex((c) => c.id === id.data);
  if (index === -1) return NOT_FOUND;
  const swapWith = direction.data === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= list.length) {
    return { ok: false, error: direction.data === "up" ? "This category is already first." : "This category is already last." };
  }

  // Renumber everything so ties and gaps from older edits cannot make a move do nothing.
  const order = list.map((c) => c.id);
  [order[index], order[swapWith]] = [order[swapWith], order[index]];
  const changed = order
    .map((cid, i) => ({ id: cid, sort_order: i + 1 }))
    .filter((c) => list.find((l) => l.id === c.id)?.sort_order !== c.sort_order);
  for (const c of changed) {
    const { error } = await ctx.supabase.from("categories").update({ sort_order: c.sort_order }).eq("id", c.id);
    if (error) return { ok: false, error: "We could not move this category. Try again in a moment." };
  }

  refresh();
  return { ok: true, message: "Order saved." };
}

// An inactive category disappears from Main Street, search and the coupon builder, and its coupons
// are hidden from shoppers until it is active again.
export async function setCategoryActive(categoryId: unknown, activeInput: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(categoryId);
  const active = z.boolean().safeParse(activeInput);
  if (!id.success || !active.success) return NOT_FOUND;

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const { data, error } = await ctx.supabase.from("categories").update({ active: active.data }).eq("id", id.data).select("name");
  if (error) return { ok: false, error: "We could not change this category. Try again in a moment." };
  if (!data?.length) return NOT_FOUND;

  refresh();
  return {
    ok: true,
    message: active.data
      ? `${data[0].name} is back on Main Street.`
      : `${data[0].name} is deactivated. Its coupons are hidden from shoppers.`,
  };
}

// Only a category no coupon has ever used can be deleted. Others can be deactivated.
export async function deleteCategory(categoryId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(categoryId);
  if (!id.success) return NOT_FOUND;

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const { count } = await ctx.supabase.from("coupons").select("id", { count: "exact", head: true }).eq("category_id", id.data);
  if (count) {
    return { ok: false, error: `This category has ${count} ${count === 1 ? "coupon" : "coupons"}, so it cannot be deleted. Deactivate it instead.` };
  }

  const { data, error } = await ctx.supabase.from("categories").delete().eq("id", id.data).select("name");
  if (error) {
    if (error.code === "23503") return { ok: false, error: "Coupons use this category, so it cannot be deleted. Deactivate it instead." };
    return { ok: false, error: "We could not delete this category. Try again in a moment." };
  }
  if (!data?.length) return NOT_FOUND;

  refresh();
  return { ok: true, message: `${data[0].name} is deleted.` };
}
