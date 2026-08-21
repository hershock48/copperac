import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // /order is out while the club stays on Toast: the path is a redirect to
  // the Toast store (next.config.ts), and redirects do not belong in a
  // sitemap. Restore it here if the in-house ordering channel is switched on.
  const routes = ["", "/menu", "/brunch", "/reserve", "/events", "/contact"];
  return routes.map((r) => ({
    url: `${SITE.url}${r}`,
    lastModified: new Date(),
    changeFrequency: r === "/events" ? "weekly" : "monthly",
    priority: r === "" ? 1 : 0.8,
  }));
}
