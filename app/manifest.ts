import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gia Phả Dòng Họ Lê",
    short_name: "Gia Phả Lê",
    description: "Dựng và tra cứu cây gia phả dòng họ Lê — hoạt động offline.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F3ECDD",
    theme_color: "#7E1C1C",
    lang: "vi",
    categories: ["lifestyle", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
