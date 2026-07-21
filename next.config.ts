import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["localhost", "192.168.2.168"],
};

export default nextConfig;
