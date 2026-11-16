import type { NextConfig } from "next";

// Where the browser's /api/backend/* requests are forwarded. This is read when
// the app is built; the deployment scripts always use the default.
const backendUrl =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // A self-contained server (about 100 MB less to install than the full
  // node_modules). Production runs `node server.js`; `npm run dev` is unchanged.
  output: "standalone",

  // Uploads pass through the /api/backend rewrite below when the web app is
  // used without the Caddy proxy. Next.js buffers proxied bodies and cuts them
  // off at 10 MB by default, which breaks larger PDFs. Keep this above the
  // backend upload limit (PDF_CRAFT_MAX_UPLOAD_MB).
  experimental: {
    proxyClientMaxBodySize: "64mb",
  },

  cacheComponents: true,
  partialPrefetching: true,

  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
