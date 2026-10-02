import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig = {
  async redirects() {
    return [
      {
        source: "/projects/:id/reports",
        destination: "/reports/:id",
        permanent: false,
      },
      {
        source: "/projects/:id/reports/:reportId",
        destination: "/reports/:id/:reportId",
        permanent: false,
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "42mb",
    },
  },
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https" as const,
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
} satisfies NextConfig;

export default nextConfig;
