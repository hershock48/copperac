/**
 * Seeds the copper org on the multi-org Scooplist deployment with the
 * bar's cocktail program, straight from lib/menu.ts (the printed-menu
 * truth) plus the Toast harvest (data/toast-d.json) as a rotation library,
 * so the data is never typed twice. Idempotent-ish: flavors are matched by
 * (name, category) against the existing library and updated rather than
 * duplicated, so re-running after a fix is safe. Case entries use the
 * app's own idempotent "in".
 *
 * Run (PowerShell), with the org's real PIN in YOUR terminal only:
 *
 *   $env:SCOOPLIST_ADMIN_PIN = "<pin>"
 *   node --experimental-strip-types tools/populate-scooplist.mjs https://scooplist.glazedweb.com
 *
 * The org must already exist with this CATEGORY CONTRACT (the same list
 * lib/taplist.ts documents; scooplist/tools/create-org.mjs creates it):
 *
 *   slug copper, location marshall:Copper Athletic Club
 *   categories: taps:On Tap,cocktails:Cocktails
 *
 * What gets seeded, and what deliberately does not:
 *  - The 6 printed-menu cocktails (lib/menu.ts COCKTAILS): into the
 *    library AND the case, because they are what the site shows today.
 *  - Alcohol-flagged Toast drinks not already among those 6: library
 *    ONLY, a rotation shelf so swapping a cocktail is two taps in /case.
 *    Toast's CloudFront image URLs are skipped (the site renders no drink
 *    photos, and those images are Toast's hosting, not ours). Non-alcohol
 *    items are skipped entirely (no NA category in v1).
 *  - TAPS: NOTHING. Tap names are net-new content only the bar knows;
 *    until they enter them at /case the site shows the taps-rotate panel,
 *    by design.
 */

import { readFileSync } from "node:fs";
import { COCKTAILS } from "../lib/menu.ts";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
const PIN = process.env.SCOOPLIST_ADMIN_PIN || "";
const ORG = "copper";
const LOCATION = "marshall";

if (!BASE || !PIN) {
  console.error(
    'Usage: $env:SCOOPLIST_ADMIN_PIN="<pin>"; node --experimental-strip-types tools/populate-scooplist.mjs <base-url>',
  );
  process.exit(1);
}

/* --------------------------- rows to push --------------------------- */

const rows = [];
const seen = new Set();

// The printed menu first: these also go into the case.
for (const item of COCKTAILS.items) {
  seen.add(item.name.toLowerCase());
  rows.push({
    category: "cocktails",
    name: item.name,
    producer: "",
    abv: "",
    tags: [],
    description: item.desc,
    sizes: [{ label: "Each", price: `$${Number(item.price).toFixed(2).replace(/\.00$/, "")}` }],
    inCase: true,
  });
}

// The Toast harvest: library-only rotation stock.
const toast = JSON.parse(readFileSync(new URL("../data/toast-d.json", import.meta.url), "utf8"));
for (const item of toast) {
  if (!item.alcohol) continue;
  if (seen.has(item.name.toLowerCase())) continue;
  seen.add(item.name.toLowerCase());
  const price = (item.priceCents ?? 0) / 100;
  rows.push({
    category: "cocktails",
    name: item.name,
    producer: "",
    abv: "",
    tags: [],
    description: item.desc ?? "",
    sizes: price > 0 ? [{ label: "Each", price: `$${price.toFixed(2).replace(/\.00$/, "")}` }] : [],
    inCase: false,
  });
}

/* ------------------------------ push ------------------------------- */

// Org-mode login: same endpoint as always, plus the org slug in the body.
const login = await fetch(`${BASE}/api/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ org: ORG, pin: PIN }),
  redirect: "manual",
});
const cookie = login.headers.get("set-cookie")?.split(";")[0];
if (!cookie || login.headers.get("location")?.includes("bad")) {
  console.error(`Login failed (${login.status}). Wrong PIN, wrong org, or the address is throttled.`);
  process.exit(1);
}
console.log(`Logged in to ${BASE} as org "${ORG}"`);

async function api(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

// Existing library, so a re-run updates instead of duplicating.
const exportRes = await fetch(`${BASE}/api/admin/export`, { headers: { cookie } });
const existing = exportRes.ok ? ((await exportRes.json()).flavors ?? []) : [];
const byKey = new Map(existing.map((f) => [`${f.category} ${f.name}`, f.id]));

let created = 0;
let updated = 0;
for (const row of rows) {
  const { inCase, ...payload } = row;
  const id = byKey.get(`${row.category} ${row.name}`);
  const { flavor } = await api("/api/admin/flavors", id ? { ...payload, id } : payload);
  if (flavor.category !== row.category) {
    // The deployment rejected the category, so the org's board list is
    // missing this key. Stop loudly rather than filing cocktails under
    // whatever the first board happens to be.
    console.error(
      `STOP: "${row.name}" wanted category "${row.category}" but saved as "${flavor.category}". ` +
        `Recreate the org with the category contract in the header, then re-run.`,
    );
    process.exit(1);
  }
  if (id) updated += 1;
  else created += 1;
  if (inCase) {
    await api("/api/admin/case", { action: "in", locationId: LOCATION, flavorId: flavor.id });
  }
}

console.log(`Done: ${created} created, ${updated} updated; printed-menu cocktails are in the ${LOCATION} case.`);
console.log(
  "Taps were not seeded on purpose. Until the bar enters them at /case, the site shows the taps-rotate panel, by design.",
);
console.log(`Check: ${BASE}/api/v1/orgs/${ORG}/case/${LOCATION}`);
