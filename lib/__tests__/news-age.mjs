// Boundary test for the currency rules in lib/news.ts. `node lib/__tests__/news-age.mjs`.
// The cutoff exists because the crawl once had none: the sort takes the newest items regardless
// of age, so a club deep in its offseason surfaced month-old copy as news. Kevin: "I do not
// expect pistons news when it is not bball season" -- a quiet club drops out, it does not pad.

// The two rules the cutoff and the label have to obey, with the boundaries pinned.
const MAX_AGE_DAYS = 10;
const H = 3_600_000;
const label = ms => { const h = ms / H; return h < 48 ? null : `${Math.floor(h/24)}d`; };
const kept  = ms => ms <= MAX_AGE_DAYS * 24 * H;

const cases = [
  ["2 hours old",        2*H,     null,  true],
  ["23 hours old",       23*H,    null,  true],
  ["47 hours old",       47*H,    null,  true],
  ["48 hours exactly",   48*H,    "2d",  true],
  ["3 days old",         72*H,    "3d",  true],
  ["9 days old",         216*H,   "9d",  true],
  ["10 days exactly",    240*H,   "10d", true],
  ["11 days old",        264*H,   "11d", false],
  ["a month old",        720*H,   "30d", false],
];
let fail = 0;
console.log("age                 label   kept");
for (const [name, ms, wantLabel, wantKept] of cases) {
  const gl = label(ms), gk = kept(ms);
  const ok = gl === wantLabel && gk === wantKept;
  if (!ok) fail++;
  console.log(`${ok?"  ":"XX"} ${name.padEnd(18)} ${String(gl).padEnd(7)} ${gk}`);
}
console.log(`\n${fail ? fail + " WRONG" : "all correct"}`);
console.log("no date at all -> dropped (cannot claim currency for an undateable item)");
process.exit(fail ? 1 : 0);
