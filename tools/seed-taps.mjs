/**
 * Puts the bar's tap list on its Scooplist board, from the chalkboard.
 *
 * Current list: the board photographed 19 Oct 2026, sixteen handles with
 * ABVs (the first run was the 2 Sep board). Written as the board reads,
 * except "Icabod", which is New Holland's Ichabod.
 *
 * This is a head start, not a source of truth: the bar keeps the list
 * current in Scooplist, and this file goes stale the first time a keg
 * kicks. Do not "fix" the website from this file; fix the board in
 * Scooplist, or update this list from a fresh photo and run it again.
 *
 * Run (PowerShell), with the org's real PIN in YOUR terminal only:
 *
 *   $env:SCOOPLIST_ADMIN_PIN = "<pin>"
 *   node tools/seed-taps.mjs https://scooplist.glazedweb.com --replace-wall
 *
 * Every tap below is matched against the library by name (and a few
 * aliases), added or updated in place, and put on the marshall wall.
 *
 * --replace-wall makes the wall exactly this list: any tap on the wall
 * that is not below is taken OFF ("out" closes the entry, it is not
 * deleted; the tap stays in the library and goes back on in two taps),
 * and the wall is put in the board's order. Without the flag nothing is
 * taken off, which is the safe re-run when the bar has been adding taps
 * of its own since the photo. Cocktails are never touched.
 *
 * The descriptions are our own one-liners (style and flavor, not the
 * breweries' marketing copy). Where we could not confirm a beer's style
 * the line says only who makes it. The bar can rewrite any of them in the
 * Scooplist library; a re-run puts ours back.
 */

const BASE = process.argv[2]?.replace(/\/$/, "");
const REPLACE_WALL = process.argv.includes("--replace-wall");
const PIN = process.env.SCOOPLIST_ADMIN_PIN || "";
const ORG = "copperac";
const LOCATION = "marshall";

if (!BASE || !PIN) {
  console.error('Usage: $env:SCOOPLIST_ADMIN_PIN="<pin>"; node tools/seed-taps.mjs <base-url> [--replace-wall]');
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
    name: "M-43 Hazy IPA",
    producer: "Old Nation",
    abv: "6.8",
    tags: MI,
    aliases: ["M-43", "M43", "Old Nation M-43 Hazy"],
    description: "New England style IPA. Hazy, juicy, tropical fruit up front.",
  },
  {
    name: "Two Hearted",
    producer: "Bell's",
    abv: "7",
    tags: MI,
    aliases: ["Bell's Two Hearted", "Bells Two Hearted", "Two-Hearted"],
    description: "American IPA built on Centennial hops. Grapefruit and pine.",
  },
  // Featured
  { name: "Corktoberfest", producer: "Brew City", abv: "5.7", description: "Oktoberfest style, for the season." },
  { name: "MI IPA", producer: "North Peak", abv: "6.6", tags: MI, description: "IPA from North Peak, a Michigan brewery." },
  { name: "Cherry Wheat", producer: "Samuel Adams", abv: "5.3", aliases: ["Sam Adams Cherry Wheat"], description: "Wheat ale brewed with cherries." },
  { name: "Yuengling Lager", producer: "Yuengling", abv: "4.5", description: "Amber lager from America's oldest brewery." },
  { name: "Sportsman Copper Lager", producer: "Altes", abv: "5", aliases: ["Altes Sportsman Copper Lager"], description: "Copper lager. The name says the rest." },
  { name: "Blood Orange Honey", producer: "Cheboygan Brewing", abv: "6.2", tags: MI, aliases: ["Cheboygan Blood Orange Honey"], description: "Honey ale with blood orange, from up north in Cheboygan." },
  { name: "Ichabod Pumpkin Ale", producer: "New Holland", abv: "4.5", tags: MI, aliases: ["Ichabod", "Icabod Pumpkin Ale"], description: "Pumpkin ale. Fall in a glass." },
  { name: "Sparta IPA", producer: "North Peak", abv: "7.2", tags: MI, description: "IPA from North Peak, a Michigan brewery." },
  { name: "Guinness", producer: "Guinness", abv: "4.2", description: "Irish dry stout on nitro. Roasty, creamy, lighter than it looks." },
  { name: "Warlock Imperial Pumpkin Stout", producer: "Southern Tier", abv: "8.6", description: "Imperial pumpkin stout. Pumpkin pie spice with a stout's weight." },
  { name: "Ocean Man", producer: "Odd Brothers", abv: "6.5", description: "From Odd Brothers." },
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
const onList = []; // flavor ids in the board's order, for --replace-wall
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
  onList.push(flavor.id);
  if (found) updated += 1;
  else created += 1;
  console.log(`${found ? "updated" : "added  "}  ${tap.producer} ${tap.name} ${tap.abv}%`);
}

console.log(`Done: ${created} added, ${updated} updated, all ${TAPS.length} in the ${LOCATION} case.`);

/* --------------------------- --replace-wall --------------------------- */

if (REPLACE_WALL) {
  // What is on the wall right now, from the public feed (taps board only).
  const feed = await fetch(`${BASE}/api/v1/orgs/${ORG}/case/${LOCATION}`, { cache: "no-store" });
  const board = feed.ok ? ((await feed.json()).boards ?? []).find((b) => b.key === "taps") : null;
  if (!board) {
    console.error("Could not read the wall from the feed; nothing was taken off. The adds above stand.");
    process.exit(1);
  }
  const keep = new Set(onList);
  let off = 0;
  for (const f of board.flavors ?? []) {
    if (keep.has(f.id)) continue;
    await api("/api/admin/case", { action: "out", locationId: LOCATION, flavorId: f.id });
    off += 1;
    console.log(`off      ${f.producer ? `${f.producer} ` : ""}${f.name}`);
  }
  await api("/api/admin/case", { action: "reorder", locationId: LOCATION, flavorIds: onList });
  console.log(`Wall replaced: ${off} taken off (still in the library), ${onList.length} on, in the board's order.`);
}
console.log(`Check: ${BASE}/api/v1/orgs/${ORG}/case/${LOCATION}  and  https://copperac.vercel.app/api/status`);
