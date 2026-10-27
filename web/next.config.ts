import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plain static files in out/, so GitHub Pages can serve the site without a server.
  output: "export",
  // /il/adana/ becomes il/adana/index.html, which any static host serves as a folder index.
  trailingSlash: true,
  // On GitHub Pages the site lives under /<repo>/; the deploy workflow sets this, local builds leave it empty.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH,
};

export default nextConfig;
