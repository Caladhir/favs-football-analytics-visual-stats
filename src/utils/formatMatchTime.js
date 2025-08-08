// src/utils/formatMatchTime.js - ISPRAVKA ZA TIMEZONE
export function formatMatchTime(startTime) {
  if (!startTime) {
    return {
      formattedDate: "Unknown Date",
      formattedTime: "Unknown Time",
    };
  }

  try {
    // 🔧 POBOLJŠANO: Konvertuj UTC vrijeme u lokalno
    const utcDate = new Date(startTime);

    // Provjeri da li je valid datum
    if (isNaN(utcDate.getTime())) {
      throw new Error("Invalid date");
    }

    // Format datum u lokalnom vremenu
    const formattedDate = utcDate.toLocaleDateString("hr-HR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Format vrijeme u lokalnom vremenu (24-satni format)
    const formattedTime = utcDate.toLocaleTimeString("hr-HR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false, // 24-satni format
    });

    return {
      formattedDate,
      formattedTime,
    };
  } catch (error) {
    console.warn(
      "Error formatting match time:",
      error,
      "startTime:",
      startTime
    );

    return {
      formattedDate: "Invalid Date",
      formattedTime: "Invalid Time",
    };
  }
}
