// src/utils/formatMatchTime.js
export function formatMatchTime(startTime) {
  if (startTime == null) {
    return { formattedDate: "Unknown Date", formattedTime: "Unknown Time" };
  }

  let d;
  try {
    if (typeof startTime === "number") {
      // Ako je 10-znamenkasto -> sekunde; 13-znamenkasto -> milisekunde
      const ms = startTime < 1e12 ? startTime * 1000 : startTime;
      d = new Date(ms);
    } else {
      const s = String(startTime);
      // Ako string već ima timezone, prepusti JS-u;
      // ako nema TZ, tretiraj kao UTC da izbjegnemo lokalne pomake na backendu
      d = /Z$|[+\-]\d{2}:\d{2}$/.test(s)
        ? new Date(s)
        : new Date(s + (s.includes("T") ? "" : "T") + "Z");
    }

    if (isNaN(d.getTime())) throw new Error("Invalid date");
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
  } catch {
    return { formattedDate: "Invalid Date", formattedTime: "Invalid Time" };
  }
}
