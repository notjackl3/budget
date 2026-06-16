/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep native/binary-bearing server deps out of the webpack bundle. pdf-parse
  // ships a test asset; the libSQL driver stack ships prebuilt binaries and
  // markdown that webpack can't parse — they must load at runtime via Node.
  serverExternalPackages: [
    "pdf-parse",
    "@prisma/adapter-libsql",
    "@libsql/client",
    "libsql",
  ],
  eslint: {
    // Linting is run separately; don't fail production builds on lint.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
