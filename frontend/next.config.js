/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  // Local development: proxy /api/* → FastAPI on port 8000.
  // On Vercel, vercel.json routes /api/* to the Python serverless function
  // before Next.js sees the request, so these rewrites are effectively no-ops
  // in production and can be left as-is.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
