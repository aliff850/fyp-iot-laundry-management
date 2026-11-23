import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: "security",
    serverActions: {
      bodySizeLimit: "7mb",
    },
  },
  // Browser projects run with separate envs/caches alongside normal development.
  ...(process.env.SPINSENSE_E2E_VARIANT === "configured" || process.env.SPINSENSE_E2E_VARIANT === "unconfigured" ? {
    distDir: `.next/e2e-${process.env.SPINSENSE_E2E_VARIANT}`,
    typescript: { tsconfigPath: "tsconfig.e2e.json" },
  } : {}),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
