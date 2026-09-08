/**
 * The link-card images in public/og, rebuilt from the site's own photos.
 *
 *   node tools/og-cards.mjs
 *
 * One HTML template, six cards, rendered with Chromium at 1200x630 and saved
 * as JPEG. The previous generator lived outside the repo and was lost, which
 * is why "A sports bar. Not a gym." outlived the owner's request to drop it
 * by weeks: it was baked into every card and there is no way to grep a JPEG.
 * This one lives here. If the copy changes, change CARDS and re-run.
 *
 * Needs playwright-core and a Chromium it can find; it uses the Glazed audit
 * kit's browser helper when the glazedweb repo sits next to this one, and a
 * local playwright-core otherwise.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "og");
const IMG = join(ROOT, "public", "img");

const KICKER = "A Detroit sports bar · Downtown Marshall";

const CARDS = [
  {
    file: "home.jpg",
    photo: "interior-wide.webp",
    kicker: "",
    lines: ["A Detroit sports bar", "in downtown Marshall."],
    accentLine: 1,
    sub: "Inspired by the Lindell A.C. · Built on the Copper Bar",
  },
  {
    file: "menu.jpg",
    photo: "burger.webp",
    kicker: KICKER,
    lines: ["Burgers, coneys, wings", "and cold taps."],
    sub: "Kitchen runs till 10 · Dine in, carry out or order online",
  },
  {
    file: "brunch.jpg",
    photo: "interior-bar.webp",
    kicker: KICKER,
    lines: ["9 AM to 2 PM,", "every Sunday."],
    sub: "Bloody Marys, mimosa flights, peach cobbler french toast",
  },
  {
    file: "contact.jpg",
    photo: "interior-wide.webp",
    kicker: KICKER,
    lines: ["133 W. Michigan Ave.", "Marshall, Michigan"],
    sub: "Open till midnight · Sunday from 9 · (269) 558-8222",
  },
  {
    file: "events.jpg",
    photo: "event-trivia.webp",
    kicker: KICKER,
    lines: ["Trivia, watch parties", "and live music."],
    sub: "Something on the calendar most weeks",
  },
  {
    file: "reserve.jpg",
    photo: "reserve-wide.webp",
    kicker: KICKER,
    lines: ["The Copper Reserve"],
    sub: "Seats 72 · Its own bartender · Four TVs · $50 an hour",
  },
];

const dataUri = (path, mime) => `data:${mime};base64,${readFileSync(path).toString("base64")}`;

function html(card) {
  const photo = dataUri(join(IMG, card.photo), "image/webp");
  const logo = dataUri(join(IMG, "logo-white.png"), "image/png");
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const lines = card.lines
    .map((l, i) => `<span class="${i === card.accentLine ? "accent" : ""}">${esc(l)}</span>`)
    .join("<br>");
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0a0a0a}
  .card{position:relative;width:1200px;height:630px;font-family:Oswald,"Arial Narrow",sans-serif;color:#f3ede3}
  .photo{position:absolute;inset:0;background:url(${photo}) center/cover no-repeat}
  .shade{position:absolute;inset:0;background:
    linear-gradient(90deg,rgba(8,8,8,.92) 0%,rgba(8,8,8,.72) 45%,rgba(8,8,8,.42) 100%),
    linear-gradient(180deg,rgba(8,8,8,.35) 0%,rgba(8,8,8,.15) 40%,rgba(8,8,8,.7) 100%)}
  .lines{position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(255,255,255,.035) 0 1px,transparent 1px 4px);pointer-events:none}
  .frame{position:absolute;inset:28px;border:1px solid rgba(209,138,72,.55)}
  .logo{position:absolute;left:70px;top:66px;width:150px}
  .kicker{position:absolute;left:70px;top:158px;font-size:19px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;color:#d18a48}
  .head{position:absolute;left:66px;bottom:118px;font-size:74px;line-height:.98;font-weight:700;text-transform:uppercase;letter-spacing:.01em;max-width:1000px;text-shadow:0 2px 24px rgba(0,0,0,.6)}
  .head .accent{color:#d18a48}
  .rule{position:absolute;left:70px;bottom:96px;width:64px;height:2px;background:#d18a48}
  .sub{position:absolute;left:70px;bottom:62px;font-size:19px;font-weight:500;letter-spacing:.17em;text-transform:uppercase;color:#e8e2d8;opacity:.85}
</style></head><body><div class="card">
  <div class="photo"></div><div class="shade"></div><div class="lines"></div><div class="frame"></div>
  <img class="logo" src="${logo}" alt="">
  ${card.kicker ? `<div class="kicker">${esc(card.kicker)}</div>` : ""}
  <div class="head">${lines}</div>
  <div class="rule"></div>
  <div class="sub">${esc(card.sub)}</div>
</div></body></html>`;
}

async function browser() {
  const helper = join(ROOT, "..", "glazedweb", "glaze", "scripts", "lib", "browser.mjs");
  if (existsSync(helper)) {
    const { loadChromium, launchOpts } = await import(pathToFileURL(helper).href);
    const chromium = await loadChromium();
    return chromium.launch(launchOpts());
  }
  const { chromium } = await import("playwright-core");
  return chromium.launch({ channel: "chrome" });
}

const b = await browser();
const page = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const card of CARDS) {
  await page.setContent(html(card), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const path = join(OUT, card.file);
  await page.screenshot({ path, type: "jpeg", quality: 84 });
  console.log("wrote", path);
}
await b.close();
