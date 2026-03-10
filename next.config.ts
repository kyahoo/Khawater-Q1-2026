import type { NextConfig } from "next";

let supabaseHostname: string | null = null;
const khawaterAssetsHostname = "modqcliamlxgykrzacbp.supabase.co";

try {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : null;
} catch {
  supabaseHostname = null;
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: khawaterAssetsHostname,
        pathname: "/storage/v1/object/public/**",
      },
      ...(supabaseHostname
        ? [
            {
              protocol: "https",
              hostname: supabaseHostname,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
