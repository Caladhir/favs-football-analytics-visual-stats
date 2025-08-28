// src/utils/formatMatchTime.js
function _parseToDate(startTime) {
  if (startTime == null) return null;
  try {
    if (typeof startTime === "number") {
      const ms = startTime < 1e12 ? startTime * 1000 : startTime;
      return new Date(ms);
    }

    const s = String(startTime).trim();
    // If contains timezone info or ends with Z, let Date handle it
    if (/Z$|[+\-]\d{2}:\d{2}$/.test(s)) return new Date(s);

    // If ISO-like "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DD HH:mm:ss" without TZ,
    // parse components and create a local Date to avoid accidental UTC shift.
    const m = s.match(
      /(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/
    );
    if (m) {
      const year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const day = parseInt(m[3], 10);
      const hour = parseInt(m[4], 10);
      const minute = parseInt(m[5], 10);
      const second = m[6] ? parseInt(m[6], 10) : 0;
      return new Date(year, month, day, hour, minute, second);
    }

    // Fallback: let Date try to parse
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  } catch (e) {
    // ignore and return null below
  }
  return null;
}

export function parseMatchISO(startTime) {
  return _parseToDate(startTime);
}

export function formatMatchTime(startTime) {
  if (startTime == null) {
    return { formattedDate: "Unknown Date", formattedTime: "Unknown Time" };
  }

  const d = _parseToDate(startTime);
  if (!d || isNaN(d.getTime())) {
    return { formattedDate: "Invalid Date", formattedTime: "Invalid Time" };
  }
  return {
    formattedDate: d.toLocaleDateString("hr-HR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    formattedTime: d.toLocaleTimeString("hr-HR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}
