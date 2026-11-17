import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SpinSense Operations",
    short_name: "SpinSense",
    description: "Organization-isolated laundry operations and LPG safety console",
    start_url: "/branches",
    scope: "/",
    display: "standalone",
    background_color: "#171719",
    theme_color: "#14243a",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
