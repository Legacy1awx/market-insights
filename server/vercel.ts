import { createServer } from "./index.ts";

// Entry for the Vercel serverless function: the Express app handles every
// /api/* request. Static files and SPA routes are served by Vercel directly.
export default createServer();
