// Empty string in dev (relies on the Vite dev-server proxy in vite.config.ts
// to forward /api -> localhost:8000, exactly as before) — set VITE_API_URL
// at build time in production (e.g. Cloudflare Pages env var) to point at
// the deployed backend, since a static build has no dev-server proxy.
export const API_BASE = import.meta.env.VITE_API_URL || ''
