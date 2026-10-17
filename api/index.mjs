// Vercel serverless function. vercel.json rewrites every /api/* request here;
// the bundled Express app (built by `npm run build:vercel`) routes it.
export { default } from "../dist/vercel/app.mjs";
