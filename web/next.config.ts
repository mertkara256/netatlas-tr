import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plain static files in out/, so GitHub Pages can serve the site without a server.
  output: "export",
};

export default nextConfig;
