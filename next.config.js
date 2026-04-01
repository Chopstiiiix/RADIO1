/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    const backend = process.env.BROADCAST_API_URL || "http://localhost:5001";
    return [
      { source: "/stream/:path*", destination: `${backend}/stream/:path*` },
      { source: "/metadata/:path*", destination: `${backend}/metadata/:path*` },
      { source: "/api/channels/:path*", destination: `${backend}/api/channels/:path*` },
      { source: "/api/mic/:slug", destination: `${backend}/api/mic/:slug` },
      { source: "/api/mic/:slug/:action", destination: `${backend}/api/mic/:slug/:action` },
    ];
  },
};

module.exports = nextConfig;
