import { NextResponse, type NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Park the in-house "Jelly" ordering platform on the live client site.
//
// The club uses Toast for online ordering (Kevin's call, Aug 2026). We built a
// full in-house ordering system — the guest order page, the /kitchen staff
// board, their APIs, and the sales pitch for it — and we are KEEPING all of it
// (it may be used later), but none of it should be reachable on the client's
// own site. It stays fully alive on the marketing/demo host so it can still be
// shown and, someday, switched on.
//
// One Vercel deployment serves both the client site (copperac.com,
// copperac.vercel.app) and the demo host (see the host-scoped rewrites in
// next.config.ts), so the gate is by Host header, not an env flag. The guest
// /order page is parked separately in next.config.ts (redirect to Toast, with
// the same pitch-host exception); this proxy covers everything else:
// /kitchen, the ordering/kitchen APIs, and the /pitch/* pages.
//
// To bring the in-house platform back to the client site, remove this file (or
// flip the host check) and the /order redirect in next.config.ts together.
// ---------------------------------------------------------------------------

const PITCH_HOST = "copperac.glazedweb.com";

export function proxy(request: NextRequest) {
  // On the demo host everything works — that is where the preserved tool lives.
  if ((request.headers.get("host") ?? "") === PITCH_HOST) {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;

  // Staff board and the sales pitch: send anyone who finds the URL to the home
  // page. A guest on the real site should never land on the kitchen board or on
  // our proposal for the club.
  if (
    path === "/kitchen" ||
    path.startsWith("/kitchen/") ||
    path.startsWith("/pitch/")
  ) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home, 307);
  }

  // In-house ordering APIs: 404 as if not deployed. Nothing on the client site
  // calls these — the /order page redirects to Toast, so its client never runs.
  if (path.startsWith("/api/ordering/") || path.startsWith("/api/kitchen/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/kitchen",
    "/kitchen/:path*",
    "/pitch/:path*",
    "/api/ordering/:path*",
    "/api/kitchen/:path*",
  ],
};
