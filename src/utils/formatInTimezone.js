// src/utils/formatInTimezone.js
// Lightweight helper to format an ISO/date value in a specific IANA timezone regardless of user system TZ.
// Uses Intl.DateTimeFormat which is supported in modern browsers. If TZ unsupported, falls back to local.

export function formatInTimezone(dateInput, {
  timeZone = 'Europe/Zagreb',
  withSeconds = false,
  locale = 'en-GB'
} = {}) {
  if (!dateInput) return { date: '—', time: '—', dateTime: '—' };
  const d = typeof dateInput === 'string' || typeof dateInput === 'number'
    ? new Date(dateInput)
    : dateInput instanceof Date
    ? dateInput
    : null;
  if (!d || isNaN(d.getTime())) return { date: 'Invalid', time: 'Invalid', dateTime: 'Invalid' };

  const optsDate = { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' };
  const optsTime = { timeZone, hour: '2-digit', minute: '2-digit', hour12: false };
  if (withSeconds) optsTime.second = '2-digit';
  let dateStr, timeStr;
  try {
    dateStr = new Intl.DateTimeFormat(locale, optsDate).format(d);
    timeStr = new Intl.DateTimeFormat(locale, optsTime).format(d);
  } catch (e) {
    // Fallback local
    dateStr = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return { date: dateStr, time: timeStr, dateTime: `${dateStr} ${timeStr}` };
}

// Convenience for just time.
export function formatTimeTZ(dateInput, tz='Europe/Zagreb') {
  return formatInTimezone(dateInput, { timeZone: tz }).time;
}