// src/services/live.js
export const LIVE_REFRESH_MS = 15_000; // kad ima live utakmica
export const IDLE_REFRESH_MS = 60_000; // kad trenutno nema live
export const MAX_LIVE_AGE_HOURS = 3; // safety: "live" > 3h -> FT
export const LIVE_STALE_SEC = 300; // 5 min: tolerancija  updated_at
export const DISPLAY_BACKEND_FRESH_SEC = 75;
