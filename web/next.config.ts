import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plain static files in out/, so GitHub Pages can serve the site without a server.
  output: "export",
  // /il/adana/ becomes il/adana/index.html, which any static host serves as a folder index.
  trailingSlash: true,
};

export default nextConfig;
