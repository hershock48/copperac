import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/menu", "/brunch", "/reserve", "/events", "/contact"];
  return routes.map((r) => ({
    url: `${SITE.url}${r}`,
    lastModified: new Date(),
    changeFrequency: r === "/events" ? "weekly" : "monthly",
    priority: r === "" ? 1 : 0.8,
  }));
}
