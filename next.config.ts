import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: ["bullmq", "ioredis"],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // Com proxy.ts ativo, o Next amortece corpos de requisição com limite
    // default de 10MB — corpos maiores chegam truncados. 100mb cobre os
    // uploads (mesmo limite do /api/upload).
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
