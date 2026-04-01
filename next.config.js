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
      { source: "/mic-stream/:path*", destination: `${backend}/api/mic/:path*` },
      { source: "/api/livekit/:path*", destination: `${backend}/api/livekit/:path*` },
    ];
  },
};

module.exports = nextConfig;
