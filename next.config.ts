import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local auth integration gets its own bundles so no linked-project public
  // configuration is baked into the disposable test server.
  distDir: process.env.SCOUT_AUTH_TEST === "1" ? ".next-auth-test" : ".next",
};

export default nextConfig;
