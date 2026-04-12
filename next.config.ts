import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // Use a path without Japanese characters for build output to avoid filesystem issues
  distDir: process.env.NEXT_BUILD_DIR || path.join(process.env.HOME || '/tmp', '.next-isyutsubonpx'),
  // Empty turbopack config silences the "webpack config but no turbopack config" warning
  turbopack: {},
};

export default nextConfig;
