import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // Empty turbopack config silences the "webpack config but no turbopack config" warning
  turbopack: {},
};

export default nextConfig;
