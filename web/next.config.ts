import type { NextConfig } from "next";

/**
 * The web app calls the API at same-origin `/api/*` and Next proxies it to
 * the Express backend. This sidesteps two iOS Safari blockers at once:
 *   1. Mixed content — an https:// PWA page cannot call an http:// LAN API.
 *   2. CORS — same-origin requests never trigger preflight at all.
 * Point API_PROXY_URL elsewhere for staging/production.
 */
const API_PROXY_URL = process.env.API_PROXY_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
