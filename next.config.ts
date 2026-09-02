import type { NextConfig } from "next";

// The marketing/demo host. The pitch renders at its root and the live in-house
// product renders under /demo (see rewrites() below). The Toast parking
// redirect deliberately does NOT fire here, so the demo — and the Jelly pitch,
// whose entire argument is replacing Toast with in-house ordering — keeps
// reaching the real /order page instead of bouncing viewers to Toast.
const PITCH_HOST = "copperac.glazedweb.com";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/webp"],
    // The ordering menu's item photos are the bar's own Toast uploads,
    // hot-linked from Toast's public CDN (see lib/ordering/menu.ts for why,
    // and the README for the migrate-before-leaving-Toast obligation).
    remotePatterns: [
      { protocol: "https", hostname: "d1w7312wesee68.cloudfront.net" },
      { protocol: "https", hostname: "d2s742iet3d3t1.cloudfront.net" },
    ],
  },
  async redirects() {
    // Preserve the URLs the current WordPress site has indexed.
    return [
      { source: "/menus", destination: "/menu", permanent: true },
      { source: "/home", destination: "/", permanent: true },
      // The in-house /order page is parked while the club stays on Toast for
      // online ordering (Kevin's call, Aug 2026). This redirect runs before
      // the filesystem, so app/order/page.tsx stays built but unreachable:
      // no guest can place an order on a kitchen board nobody is watching.
      // Deliberately not permanent — browsers cache 308s for good, and this
      // decision is "for now". Keep the destination in step with
      // SITE.orderUrl in lib/site.ts; delete this line to bring /order back.
      //
      // `missing` host guard: everywhere EXCEPT the pitch host. Redirects run
      // before rewrites and a rewrite target is never re-checked against
      // redirects, so without this guard the pitch host's /demo/order rewrite
      // (-> /order) and the Jelly pitch's own /order CTAs would all 307 to
      // Toast — the demo, and the proposal to replace Toast, silently sending
      // people to Toast. On the pitch host /order renders the real in-house
      // page, which is exactly what the demo needs.
      {
        source: "/order",
        missing: [{ type: "host", value: PITCH_HOST }],
        destination: "https://order.toasttab.com/online/copper-pub",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    // ------------------------------------------------------------------
    // copperac.glazedweb.com: the pitch at the root, the demo under /demo.
    //
    // Both rules are scoped to that host, so copperac.vercel.app and, later,
    // copperac.com are untouched and keep serving the site at their root with
    // no pitch page anywhere near them.
    //
    // Done with host-scoped rewrites rather than basePath on purpose. basePath
    // is global to a build, so setting it to /demo would also bury the real
    // client site under /demo the day copperac.com goes live. This way one
    // deployment serves both, and only the marketing host behaves differently.
    //
    // Known wart, and it is fine: the app's own links are root-relative, so a
    // visitor who lands on /demo and clicks Menu ends up at /menu rather than
    // /demo/menu. Nothing 404s, they stay on the demo, the prefix just drops
    // off. Making it persist would need basePath and the trade above.
    //
    // DELETE ALL OF THIS, plus public/pitch/, once Copper signs or passes.
    // ------------------------------------------------------------------
    // beforeFiles is load-bearing. A plain rewrites() array is afterFiles,
    // which runs only once Next has failed to find a page, and app/page.tsx
    // already answers "/" — so the root rewrite below would never have fired.
    const onPitchHost = [{ type: "host" as const, value: PITCH_HOST }];
    return {
      beforeFiles: [
        { source: "/", destination: "/pitch/copper-athletic-club.html", has: onPitchHost },
        { source: "/demo", destination: "/", has: onPitchHost },
        { source: "/demo/:path*", destination: "/:path*", has: onPitchHost },
      ],
      afterFiles: [
        // The path form, so the pitch is reachable on any host this is deployed
        // to. Useful before the subdomain exists and harmless after.
        {
          source: "/pitch/copper-athletic-club",
          destination: "/pitch/copper-athletic-club.html",
        },
        // The ordering proposal (working product name: Jelly). Separate page
        // from the website pitch on purpose: different ask, different meeting.
        { source: "/pitch/jelly", destination: "/pitch/jelly.html" },
      ],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Every path on the marketing host, not just the pitch. The demo under
        // /demo is a full copy of the client's site, and the last thing they
        // need is a second host of ours competing with copperac.com for their
        // own name. Scoped by host, so the real site is unaffected.
        source: "/:path*",
        has: [{ type: "host", value: "copperac.glazedweb.com" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // Belt and braces for the path form on any other host.
        source: "/pitch/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // Every *.vercel.app address (copperac.vercel.app, the
        // copperac-glazedweb and git-main aliases, and each per-deploy URL)
        // serves the same site as copperac.com. Left indexable they compete
        // with the club for its own name. Host-scoped, so copperac.com
        // itself is untouched.
        source: "/:path*",
        has: [{ type: "host", value: "(.*)\\.vercel\\.app" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
