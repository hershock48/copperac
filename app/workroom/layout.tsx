import type { Metadata } from "next";
import WorkroomChrome from "@/components/workroom/Chrome";

/**
 * The workroom's shell: none of the site's chrome, all of its tokens. A tool
 * for the club, not a page for a guest. Out of the sitemap, out of search,
 * out of every nav on the customer site; reached by its address alone.
 *
 * The styles live here rather than in globals.css so the customer pages
 * never carry the weight of a tool they cannot open (the pattern since
 * devine). Copper on ink, like the site, at tool scale.
 */
export const metadata: Metadata = {
  title: { default: "Workroom | Copper Athletic Club", template: "%s | Workroom" },
  description: "Events and the menu on copperac.com.",
  robots: { index: false, follow: false },
};

export default function WorkroomLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="wr-skip" href="#main">
        Skip to content
      </a>
      <WorkroomChrome />
      <main id="main" className="wr-main">
        <div className="wr-wrap">{children}</div>
      </main>

      <style>{`
        .wr-skip { position: absolute; left: -9999px; top: 8px; z-index: 60; background: var(--color-copper); color: var(--color-ink); padding: 10px 16px; font-weight: 700; }
        .wr-skip:focus { left: 8px; }
        .wr-main { padding: 28px 0 110px; background: var(--color-ink); min-height: 70vh; color: var(--color-cream); font-family: var(--font-body); }
        .wr-wrap { max-width: 960px; margin: 0 auto; padding: 0 20px; }

        .wr-chrome { position: sticky; top: 0; z-index: 30; background: var(--color-ink-soft); border-bottom: 1px solid var(--color-ink-line); }
        .wr-chrome-in { max-width: 960px; margin: 0 auto; padding: 8px 20px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
        .wr-brand { display: flex; align-items: baseline; gap: 8px; text-decoration: none; color: inherit; padding: 6px 0; }
        .wr-shop { font-family: var(--font-display); font-size: 16px; text-transform: uppercase; letter-spacing: .08em; color: var(--color-cream); }
        .wr-word { font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--color-copper-light); }
        .wr-tabs { display: flex; gap: 18px; flex: 1 1 auto; flex-wrap: wrap; }
        .wr-tabs a { font-family: var(--font-display); font-size: 13px; letter-spacing: .12em; text-transform: uppercase; text-decoration: none; color: var(--color-cream-dim); padding: 9px 1px; border-bottom: 2px solid transparent; white-space: nowrap; }
        .wr-tabs a[aria-current="page"] { color: var(--color-copper-light); border-bottom-color: var(--color-copper); }
        .wr-right { display: flex; align-items: center; gap: 16px; }
        .wr-right a, .wr-right button { font-size: 13px; font-weight: 600; color: var(--color-cream-dim); text-decoration: none; background: none; border: 0; font-family: inherit; cursor: pointer; padding: 9px 1px; }
        .wr-right a:hover, .wr-right button:hover { color: var(--color-cream); }
        @media (max-width: 700px) {
          .wr-chrome-in { padding: 6px 16px; gap: 0 14px; }
          .wr-brand { order: 1; }
          .wr-right { order: 2; margin-left: auto; }
          .wr-tabs { order: 3; width: 100%; gap: 14px; }
        }

        .wr-head { margin-bottom: 22px; }
        .wr-head h1 { font-family: var(--font-display); font-size: clamp(26px, 4vw, 34px); text-transform: uppercase; letter-spacing: .04em; color: var(--color-cream); }
        .wr-h2 { font-family: var(--font-display); font-size: 14px; letter-spacing: .16em; text-transform: uppercase; color: var(--color-copper-light); font-weight: 500; margin: 34px 0 12px; }
        .wr-muted { color: var(--color-cream-dim); opacity: .8; font-size: 15px; margin-top: 6px; line-height: 1.55; }
        .wr-error { color: #e08a80; font-weight: 600; font-size: 15px; margin-top: 12px; }
        .wr-saved { color: var(--color-copper-light); font-weight: 600; font-size: 14px; }
        .wr-warn { background: rgba(184,109,42,.14); border: 1px solid rgba(184,109,42,.5); color: var(--color-cream); border-radius: 4px; padding: 14px 16px; font-size: 14.5px; line-height: 1.6; margin-bottom: 22px; }

        .wr-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
        .wr-card { background: var(--color-ink-soft); border: 1px solid var(--color-ink-line); border-radius: 4px; }
        .wr-row { display: flex; align-items: center; gap: 14px; padding: 14px 16px; flex-wrap: wrap; width: 100%; text-align: left; background: none; border: 0; color: inherit; font: inherit; cursor: pointer; }
        .wr-row:hover { background: rgba(255,255,255,.03); }
        .wr-row-main { flex: 1 1 200px; min-width: 0; }
        .wr-row-name { display: block; font-family: var(--font-display); font-size: 17px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-cream); }
        .wr-row-sub { display: block; font-size: 13.5px; color: var(--color-cream-dim); opacity: .8; margin-top: 3px; }
        .wr-thumb { width: 56px; height: 70px; object-fit: cover; border-radius: 3px; background: var(--color-ink); flex: 0 0 auto; }

        .wr-chip { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
        .wr-chip-on { background: var(--color-copper); color: var(--color-ink); }
        .wr-chip-off { background: transparent; color: var(--color-cream-dim); box-shadow: inset 0 0 0 1px var(--color-ink-line); }
        .wr-chip-past { background: transparent; color: var(--color-cream-dim); opacity: .6; box-shadow: inset 0 0 0 1px var(--color-ink-line); }

        .wr-panel { background: var(--color-ink-soft); border: 1px solid var(--color-ink-line); border-radius: 4px; padding: 20px 20px 18px; margin: 14px 0 22px; }
        .wr-form { display: grid; gap: 16px; }
        .wr-two { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
        .wr-field label, .wr-field > .wr-label { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-weight: 600; font-size: 14.5px; color: var(--color-cream); margin-bottom: 6px; }
        .wr-field input, .wr-field textarea, .wr-field select { width: 100%; font: inherit; font-size: 16px; padding: 11px 13px; border: 1px solid var(--color-ink-line); border-radius: 4px; background: var(--color-ink); color: var(--color-cream); color-scheme: dark; }
        .wr-field input:focus, .wr-field textarea:focus { border-color: var(--color-copper); outline: none; }
        .wr-field input[aria-invalid="true"], .wr-field textarea[aria-invalid="true"] { border-color: #e08a80; }
        .wr-field textarea { resize: vertical; min-height: 88px; }
        .wr-help { font-size: 13px; color: var(--color-cream-dim); opacity: .75; margin-top: 6px; line-height: 1.5; }
        .wr-field-error { font-size: 13.5px; color: #e08a80; font-weight: 600; margin-top: 6px; }
        .wr-check { display: flex; align-items: center; gap: 10px; font-size: 15px; color: var(--color-cream); padding: 6px 0; cursor: pointer; }
        .wr-check input { width: 22px; height: 22px; accent-color: var(--color-copper); flex-shrink: 0; }
        .wr-save-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 14px; }
        .wr-save-sticky { position: sticky; bottom: 0; background: var(--color-ink); padding: 14px 0 16px; margin-top: 30px; border-top: 1px solid var(--color-ink-line); z-index: 5; }
        .wr-btn { display: inline-block; font-family: var(--font-display); font-size: 13px; letter-spacing: .14em; text-transform: uppercase; cursor: pointer; padding: 12px 20px; border-radius: 3px; border: 0; background: var(--color-copper); color: var(--color-ink); text-decoration: none; }
        .wr-btn:hover { background: var(--color-copper-light); }
        .wr-btn:disabled { opacity: .6; cursor: default; }
        .wr-btn-ghost { background: transparent; color: var(--color-copper-light); box-shadow: inset 0 0 0 1px var(--color-copper); }
        .wr-btn-ghost:hover { background: rgba(184,109,42,.15); }
        .wr-link { font: inherit; font-size: 14px; font-weight: 600; color: var(--color-copper-light); background: none; border: 0; cursor: pointer; padding: 9px 2px; text-decoration: underline; text-underline-offset: 3px; }
        .wr-link-danger { color: #e08a80; }
        .wr-photo { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
        .wr-photo img { width: 120px; height: 150px; object-fit: cover; border-radius: 3px; background: var(--color-ink); }

        .wr-menu-item { display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr) 110px; align-items: start; padding: 12px 0; border-top: 1px solid var(--color-ink-line); }
        .wr-menu-item .wr-name { font-family: var(--font-display); font-size: 15px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-cream); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .wr-menu-item textarea { min-height: 44px; font-size: 14px; margin-top: 8px; }
        .wr-menu-item .wr-price { position: relative; }
        .wr-menu-item .wr-price span { position: absolute; left: 12px; top: 12px; color: var(--color-cream-dim); }
        .wr-menu-item .wr-price input { padding-left: 24px; font-variant-numeric: tabular-nums; }
        .wr-menu-item.wr-hidden .wr-name, .wr-menu-item.wr-hidden textarea { opacity: .45; }

        .wr-gate { max-width: 380px; margin: 40px auto; }
        .wr-gate h1 { font-family: var(--font-display); font-size: 30px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-cream); }
        .wr-gate form { margin-top: 20px; display: grid; gap: 8px; }
        .wr-gate label { font-weight: 600; font-size: 15px; color: var(--color-cream); }
        .wr-gate input { font: inherit; font-size: 16px; padding: 12px 14px; border: 1px solid var(--color-ink-line); border-radius: 4px; background: var(--color-ink-soft); color: var(--color-cream); }
        .wr-gate input:focus { border-color: var(--color-copper); outline: none; }
        .wr-empty { background: var(--color-ink-soft); border: 1px solid var(--color-ink-line); border-radius: 4px; padding: 30px 26px; }
        .wr-empty h2 { font-family: var(--font-display); font-size: 21px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-cream); }
        .wr-empty p { margin-top: 10px; color: var(--color-cream-dim); max-width: 60ch; line-height: 1.55; }

        :where(.wr-main, .wr-chrome) :is(a, button, input, textarea, select):focus-visible { outline: 3px solid var(--color-copper-light); outline-offset: 2px; }
      `}</style>
    </>
  );
}
