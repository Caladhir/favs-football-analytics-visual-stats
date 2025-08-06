// formatMatchTime.js
export function formatMatchTime(utcString) {
  const raw_date = new Date(utcString);

  const formatter = new Intl.DateTimeFormat("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zagreb", // 👈 Dodano eksplicitno
  });

  const formatted = formatter.format(raw_date); // npr. "06. 08. 2025. 10:00"
  const [date, time] = formatted.split(", ");

  return {
    formattedDate: date,
    formattedTime: time,
  };
}
