import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { formats: ["image/webp"] },
  async redirects() {
    // Preserve the URLs the current WordPress site has indexed.
    return [
      { source: "/menus", destination: "/menu", permanent: true },
      { source: "/home", destination: "/", permanent: true },
    ];
  },
  async rewrites() {
    // The Glazed Web pitch, served at a clean URL from public/pitch/. It is a
    // standalone document in our brand, not the client's, so it stays outside
    // the app router rather than inheriting the site header and footer.
    //
    // DELETE THIS, and public/pitch/, once Copper has signed or passed. A sales
    // page arguing with the client does not belong on the client's live site.
    return [
      {
        source: "/pitch/copper-athletic-club",
        destination: "/pitch/copper-athletic-club.html",
      },
    ];
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
    ];
  },
};

export default nextConfig;
