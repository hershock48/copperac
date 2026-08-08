import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/**
 * Web app manifest. Worth having on a bar site because people save it to a
 * phone home screen to check hours and the board, and without one that shortcut
 * is a screenshot with a grey label.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} | ${SITE.tagline}`,
    short_name: SITE.shortName,
    description:
      "Detroit sports memorabilia, cold taps, burgers and Sunday brunch in downtown Marshall, Michigan.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0d0d",
    theme_color: "#0d0d0d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Android crops maskable icons to its own shape, so this cut keeps the
      // buck inside the safe zone rather than losing the antlers.
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
