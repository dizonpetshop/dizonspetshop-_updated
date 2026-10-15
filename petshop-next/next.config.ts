import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  poweredByHeader: false,
  outputFileTracingIncludes: { "/api/products/*/image": ["./public/products/**/*"], "/api/reservations/*/receipt": ["./public/assets/dizons-logo.jpg"], "/api/appointments/*/receipt": ["./public/assets/dizons-logo.jpg"] },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
