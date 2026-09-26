import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["docx", "unpdf", "mammoth", "exceljs"],
};

export default nextConfig;
