import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser projects run with separate envs/caches alongside normal development.
  ...(process.env.SPINSENSE_E2E_VARIANT === "configured" || process.env.SPINSENSE_E2E_VARIANT === "unconfigured" ? {
    distDir: `.next/e2e-${process.env.SPINSENSE_E2E_VARIANT}`,
    typescript: { tsconfigPath: "tsconfig.e2e.json" },
  } : {}),
};

export default nextConfig;
