// Calls a Next.js server action over HTTP the way the browser does, so tests go through the real
// action code: input validation, the session cookie, the admin check, and the database.
// Reads action ids from the production build, so run `npm run build` first.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const manifest = JSON.parse(readFileSync(new URL("../../.next/server/server-reference-manifest.json", import.meta.url), "utf8"));

// file is relative to the repo root, for example "src/app/admin/coupons/actions.ts".
function findAction(file, name) {
  for (const [id, entry] of Object.entries(manifest.node)) {
    if (entry.exportedName === name && entry.filename === file) {
      const worker = Object.keys(entry.workers)[0];
      const path = "/" + worker.replace(/^app\//, "").replace(/\/page$/, "").replace(/\([^)]+\)\//g, "");
      return { id, path: path === "/page" ? "/" : path };
    }
  }
  throw new Error(`No server action ${name} in ${file}. Rebuild the app.`);
}

// Returns { value } for a returned value, { redirect } when the action redirected, or
// { redirect, blocked: true } when the middleware stopped the request first.
export async function callAction(base, cookie, file, name, args) {
  const { id, path } = findAction(file, name);
  const res = await fetch(`${base}${path.replace(/\[[^\]]+\]/g, "x")}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Next-Action": id,
      "Content-Type": "text/plain;charset=UTF-8",
      Accept: "text/x-component",
      Origin: base,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(args),
  });
  const redirect = res.headers.get("x-action-redirect");
  const text = await res.text();
  if (redirect) return { redirect: redirect.split(";")[0], status: res.status };
  // The middleware turned the request away before the action ran.
  if (res.status >= 300 && res.status < 400) return { redirect: res.headers.get("location") ?? "", status: res.status, blocked: true };
  // The flight payload is one row per line, "<id>:<json>". Row 0 points at the returned value.
  const rows = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^([0-9a-f]+):(.*)$/);
    if (m) rows.set(m[1], m[2]);
  }
  const root = rows.get("0");
  if (!root) return { error: `Unexpected response ${res.status}: ${text.slice(0, 200)}` };
  const parsed = JSON.parse(root);
  let value = parsed?.a ?? parsed;
  if (typeof value === "string" && value.startsWith("$@")) value = JSON.parse(rows.get(value.slice(2)) ?? "null");
  return { value, status: res.status };
}

// Creates a confirmed user and returns cookies for the app plus a client for direct database checks.
export async function makeUser({ url, publishable, admin, email, password, role, fullName }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: role === "admin" ? "consumer" : role, full_name: fullName },
  });
  if (error) throw new Error(`create ${email}: ${error.message}`);
  if (role === "admin") {
    const { error: roleError } = await admin.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
    if (roleError) throw new Error(`make admin: ${roleError.message}`);
  }
  const jar = new Map();
  const ssr = createServerClient(url, publishable, {
    cookies: {
      getAll: () => [...jar].map(([n, v]) => ({ name: n, value: v })),
      setAll: (list) => list.forEach(({ name: n, value: v }) => (v ? jar.set(n, v) : jar.delete(n))),
    },
  });
  const signIn = await ssr.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`sign in ${email}: ${signIn.error.message}`);
  const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, email, client, cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; ") };
}
