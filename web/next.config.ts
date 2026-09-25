import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Barrel imports (lucide-react) resolve to per-module imports.
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
