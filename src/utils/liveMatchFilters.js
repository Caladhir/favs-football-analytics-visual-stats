// src/utils/liveMatchFilters.js
import { normalizeStatus } from "./matchStatusUtils";
import { LIVE_STALE_SEC, MAX_LIVE_AGE_HOURS } from "../services/live";

const LIVE_SET = new Set(["live", "ht", "inprogress", "halftime"]);

const tooOld = (start, maxH = MAX_LIVE_AGE_HOURS) => {
  const t = new Date(start).getTime();
  return Number.isFinite(t) && (Date.now() - t) / 36e5 > maxH;
};

export function getValidLiveMatchesStrict(matches, opts = {}) {
  const staleCutoffSec = opts.staleCutoffSec ?? LIVE_STALE_SEC;
  const maxAgeHours = opts.maxAgeHours ?? MAX_LIVE_AGE_HOURS;
  const now = Date.now();

  return (matches || []).filter((m) => {
    const s = normalizeStatus(m.status || m.status_type);
    if (!LIVE_SET.has(s)) return false;
    if (tooOld(m.start_time, maxAgeHours)) return false;

    // HT ne kažnjavaj po updated_at (pauza)
    if (s === "ht") return true;

    if (!m.updated_at) return true;
    const upd = new Date(m.updated_at).getTime();
    if (!Number.isFinite(upd)) return true;
    return now - upd <= staleCutoffSec * 1000;
  });
}

export function getValidLiveMatches(matches) {
  return getValidLiveMatchesStrict(matches, {
    staleCutoffSec: LIVE_STALE_SEC,
    maxAgeHours: MAX_LIVE_AGE_HOURS,
  });
}
