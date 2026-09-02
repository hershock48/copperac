/**
 * Seeds the bar's tap list into its Scooplist org, from the chalkboard
 * photographed at the bar on 2 Sep 2026 (sixteen handles, with ABVs).
 *
 * This is a one-time head start, not a source of truth: after it runs the
 * bar keeps the list current in Scooplist, and this file goes stale the
 * first time a keg kicks. Do not "fix" the website from this file; fix the
 * board in Scooplist.
 *
 * Run (PowerShell), with the org's real PIN in YOUR terminal only:
 *
 *   $env:SCOOPLIST_ADMIN_PIN = "<pin>"
 *   node tools/seed-taps.mjs https://scooplist.glazedweb.com
 *
 * Re-runnable: taps are matched against the existing library by name (and
 * a few aliases for what was hand-typed before this list existed), updated
 * in place, and put in the marshall case. Nothing is deleted; a tap that
 * has since kicked is left exactly as the bar left it.
 *
 * The descriptions are our own one-liners (style and flavor, not the
 * breweries' marketing copy, which is theirs). The bar can rewrite any of
 * them in the Scooplist library. A re-run of this file puts ours back, so
 * re-run to add taps, not to refresh words.
 */

const BASE = process.argv[2]?.replace(/\/$/, "");
const PIN = process.env.SCOOPLIST_ADMIN_PIN || "";
const ORG = "copperac";
const LOCATION = "marshall";

if (!BASE || !PIN) {
  console.error('Usage: $env:SCOOPLIST_ADMIN_PIN="<pin>"; node tools/seed-taps.mjs <base-url>');
  process.exit(1);
}

// name = what the handle says, producer = brewery, abv as written on the
// board. Michigan breweries carry the "local" tag the site renders.
const MI = ["local"];
const TAPS = [
  // Domestics
  { name: "Bud Light", producer: "Anheuser-Busch", abv: "4.2", description: "Light lager. Clean and easy." },
  { name: "PBR", producer: "Pabst", abv: "4.7", description: "American lager. The classic can, on draft." },
  { name: "Michelob Ultra", producer: "Anheuser-Busch", abv: "4.2", description: "Light lager, the lightest handle on the wall." },
  // IPAs
  {
    name: "Two Hearted",
    producer: "Bell's",
    abv: "7",
    tags: MI,
    aliases: ["Bell's Two Hearted", "Bells Two Hearted", "Two-Hearted"],
    description: "American IPA built on Centennial hops. Grapefruit and pine.",
  },
  {
    name: "M-43 Hazy IPA",
    producer: "Old Nation",
    abv: "6.8",
    tags: MI,
    aliases: ["M-43", "M43", "Old Nation M-43 Hazy"],
    description: "New England style IPA. Hazy, juicy, tropical fruit up front.",
  },
  // Featured
  { name: "Oberon Lite", producer: "Bell's", abv: "4.2", tags: MI, description: "Bell's summer wheat ale, lighter. Orange and a little spice." },
  { name: "Blue Mitten", producer: "Kuhnhenn", abv: "5.4", tags: MI, description: "From Kuhnhenn in Warren, Michigan." },
  { name: "M-43 Orange Creamsicle", producer: "Old Nation", abv: "6.8", tags: MI, description: "M-43 with orange and vanilla. Hazy IPA meets the ice cream truck." },
  { name: "Yuengling Lager", producer: "Yuengling", abv: "4.5", description: "Amber lager from America's oldest brewery." },
  { name: "Dos Equis Ambar", producer: "Dos Equis", abv: "4.7", description: "Vienna style amber lager. Toasty and smooth." },
  { name: "Summer Shandy", producer: "Leinenkugel's", abv: "4.2", description: "Wheat beer with lemonade. Made for the patio." },
  { name: "Oberon", producer: "Bell's", abv: "5.8", tags: MI, description: "Bell's summer wheat ale. Orange, spice, sunshine." },
  { name: "Limonata Pilsner", producer: "Dark Horse", abv: "4", tags: MI, description: "Pilsner from Dark Horse, brewed right here in Marshall." },
  { name: "Guinness", producer: "Guinness", abv: "4.2", description: "Irish dry stout on nitro. Roasty, creamy, lighter than it looks." },
  { name: "Warlock Imperial Pumpkin Stout", producer: "Southern Tier", abv: "8.6", description: "Imperial pumpkin stout. Pumpkin pie spice with a stout's weight." },
  { name: "Los Dos Pineapple Cider", producer: "Odd Brothers", abv: "3.4", description: "Pineapple cider. Light and sweet." },
];

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* ------------------------------ push ------------------------------- */

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

const exportRes = await fetch(`${BASE}/api/admin/export`, { headers: { cookie } });
const existing = exportRes.ok ? ((await exportRes.json()).flavors ?? []) : [];
const taps = existing.filter((f) => f.category === "taps");

function findExisting(tap) {
  const wanted = new Set([tap.name, `${tap.producer} ${tap.name}`, ...(tap.aliases ?? [])].map(norm));
  return taps.find((f) => wanted.has(norm(f.name)));
}

let created = 0;
let updated = 0;
for (const tap of TAPS) {
  const found = findExisting(tap);
  const payload = {
    category: "taps",
    name: tap.name,
    producer: tap.producer,
    abv: tap.abv,
    tags: tap.tags ?? [],
    description: tap.description ?? "",
    sizes: [],
  };
  const { flavor } = await api("/api/admin/flavors", found ? { ...payload, id: found.id } : payload);
  if (flavor.category !== "taps") {
    console.error(`STOP: "${tap.name}" saved under "${flavor.category}", not taps. The org's board list is off; fix that first.`);
    process.exit(1);
  }
  await api("/api/admin/case", { action: "in", locationId: LOCATION, flavorId: flavor.id });
  if (found) updated += 1;
  else created += 1;
  console.log(`${found ? "updated" : "added  "}  ${tap.producer} ${tap.name} ${tap.abv}%`);
}

console.log(`Done: ${created} added, ${updated} updated, all ${TAPS.length} in the ${LOCATION} case.`);
console.log(`Check: ${BASE}/api/v1/orgs/${ORG}/case/${LOCATION}  and  https://copperac.vercel.app/api/status`);
