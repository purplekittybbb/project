/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // The domain core in /src uses NodeNext-style ".js" import specifiers that
    // resolve to ".ts" source. Map them so webpack finds the TypeScript files
    // without us having to touch the engine.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
