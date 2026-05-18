const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Monorepo npm-workspace : sans outputFileTracingRoot, Next ne trace pas
  // node_modules de la racine et le standalone se retrouve sans `next` →
  // "Cannot find module 'next'" au demarrage du container prod.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  reactStrictMode: true,
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
  },
};

module.exports = nextConfig;
