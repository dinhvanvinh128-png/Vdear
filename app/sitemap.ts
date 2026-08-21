import type { MetadataRoute } from "next";

const base = "https://gia-pha.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/tree",
    "/members",
    "/branches",
    "/history",
    "/events",
    "/memorial",
    "/library",
    "/quan-ly"
  ].map((p) => ({ url: `${base}${p}`, lastModified: new Date() }));
}
