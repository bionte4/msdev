/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensures instrumentation.ts registers (Jira pull scheduler when enabled).
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
