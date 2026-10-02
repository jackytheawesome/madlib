import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.ARCADE_TEST_BUILD_DIR || ".next",
  redirects() {
    return [
      {
        source: "/room/:code",
        destination: "/chepuha/room/:code",
        permanent: true,
      },
      {
        source: "/admin",
        destination: "/chepuha/admin",
        permanent: true,
      },
      {
        source: "/admin/:path*",
        destination: "/chepuha/admin/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
