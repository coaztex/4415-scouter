import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "EPIC Scout",
    short_name: "EPIC Scout",
    description: "Event scouting and strategy for EPIC Robotz Team 4415.",
    start_url: "/events",
    scope: "/",
    display: "standalone",
    background_color: "#f7f6f3",
    theme_color: "#870203",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
