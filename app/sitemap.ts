import type { MetadataRoute } from "next";
import { getMembers } from "@/lib/data";

const base = "https://gia-pha.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const members = await getMembers();
  const staticRoutes = [
    "",
    "/tree",
    "/members",
    "/branches",
    "/history",
    "/events",
    "/memorial",
    "/library",
    "/login"
  ].map((p) => ({ url: `${base}${p}`, lastModified: new Date() }));

  const memberRoutes = members.map((m) => ({
    url: `${base}/member/${m.id}`,
    lastModified: new Date()
  }));

  return [...staticRoutes, ...memberRoutes];
}
