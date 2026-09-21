/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow an isolated build dir (e.g. for a parallel dev/verify run) so `next build` and `next dev`
  // never clobber each other's `.next`. Defaults to `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Native addon: do not bundle better-sqlite3 into the server graph.
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  // pdfjs ships a worker we import via URL; leave webpack defaults but allow canvas to be optional.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
