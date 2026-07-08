/** @type {import('next').NextConfig} */
const nextConfig = {
  // Serverless functions need to handle file uploads and PDF processing.
  // The default serverless runtime works on Vercel free tier.
  reactStrictMode: true,
  
  // Allow large PDF uploads (Vercel free tier body limit is 4.5MB for serverless,
  // but we'll handle this gracefully in the API route).
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
