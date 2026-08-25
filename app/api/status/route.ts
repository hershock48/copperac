import { NextResponse } from "next/server";
import { getDrinks } from "@/lib/taplist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Is the taplist live, or is the page on its snapshot?"
 *
 * The fallback is deliberately invisible to visitors (the menu just shows
 * the taps-rotate panel and the printed cocktails), so it must not be
 * invisible to the operator too; guessing at whether a feed reached a
 * deployment wastes an afternoon and asking the deployment takes a second
 * (the truenorth pattern). One difference from truenorth worth naming:
 * `configured` here means "env override set", not "feature on", because
 * the feed URL has a code default in lib/taplist.ts. The feed URL is a
 * public address, and everything else is a boolean or a count.
 */
export async function GET() {
  const override = process.env.SCOOPLIST_FEED_URL ?? null;
  const drinks = await getDrinks();

  return NextResponse.json(
    {
      drinks: {
        // "scooplist" = the bar's own edits drive the section.
        // "fallback"  = the taps-rotate panel / the printed cocktail list.
        taps: drinks.live.taps ? "scooplist" : "fallback",
        cocktails: drinks.live.cocktails ? "scooplist" : "fallback",
        tapCount: drinks.taps.length,
        updatedAt: drinks.updatedAt,
      },
      feed: { configured: Boolean(override), url: override ?? "code default (lib/taplist.ts)" },
      summary: drinks.live.taps
        ? `Live: ${drinks.taps.length} ${drinks.taps.length === 1 ? "tap renders" : "taps render"} from Scooplist.`
        : drinks.live.cocktails
          ? "Cocktails are live from Scooplist; no taps entered yet, showing the taps-rotate panel."
          : "Feed not answering (or nothing entered yet): showing the built-in cocktails and the taps-rotate panel.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
