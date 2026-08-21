import type { NextConfig } from "next";

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
      {
        source: "/order",
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
    const PITCH_HOST = "copperac.glazedweb.com";
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
    ];
  },
};

export default nextConfig;
