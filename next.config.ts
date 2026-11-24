import type { NextConfig } from "next";

/**
 * `npm run pages` builds a copy of the site for GitHub Pages: plain files
 * (no server), served under the repository's path, e.g. /arcane-website/.
 */
const staticSite = process.env.NEXT_PUBLIC_STATIC_SITE === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(staticSite
    ? {
        output: "export",
        basePath: process.env.STATIC_BASE_PATH ?? "",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
