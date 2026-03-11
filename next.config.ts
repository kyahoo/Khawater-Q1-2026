import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";

let supabaseHostname: string | null = null;
const khawaterAssetsHostname = "modqcliamlxgykrzacbp.supabase.co";

try {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : null;
} catch {
  supabaseHostname = null;
}

const remotePatterns: RemotePattern[] = [
  {
    protocol: "https",
    hostname: khawaterAssetsHostname,
    pathname: "/storage/v1/object/public/**",
  },
];

if (supabaseHostname && supabaseHostname !== khawaterAssetsHostname) {
  remotePatterns.push({
    protocol: "https",
    hostname: supabaseHostname,
    pathname: "/storage/v1/object/public/**",
  });
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "4.5mb",
    },
  },
  images: {
    remotePatterns,
  },
};

export default nextConfig;
