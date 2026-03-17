/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    const backend = "http://localhost:5000";
    return [
      { source: "/stream/:path*", destination: `${backend}/stream/:path*` },
      { source: "/metadata/:path*", destination: `${backend}/metadata/:path*` },
      { source: "/api/channels/:path*", destination: `${backend}/api/channels/:path*` },
    ];
  },
};

module.exports = nextConfig;
