export function getValidLiveMatchesRelaxed(matches) {
  if (!matches || !Array.isArray(matches)) {
    return [];
  }

  const now = new Date();
  let filteredCount = 0;

  const valid = matches.filter((match) => {
    // Provjeri da li je utakmica označena kao live/ht
    const isLiveStatus = ["live", "ht", "inprogress", "halftime"].includes(
      match.status?.toLowerCase()
    );

    if (!isLiveStatus) {
      return false;
    }

    // 🔧 BLAŽJI FILTER: Samo ukloni utakmice starije od 10 sati
    if (match.start_time) {
      const startTime = new Date(match.start_time);
      const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

      // Utakmice starije od 10 sati su definitivno zombie
      if (hoursElapsed > 10) {
        console.warn(
          `⚠️ Very old match filtered: ${match.home_team} vs ${
            match.away_team
          } (${hoursElapsed.toFixed(1)}h old)`
        );
        filteredCount++;
        return false;
      }

      // Utakmice u budućnosti (više od 2 sata) su greška
      if (hoursElapsed < -2) {
        console.warn(
          `⚠️ Future match filtered: ${match.home_team} vs ${match.away_team}`
        );
        filteredCount++;
        return false;
      }
    }

    return true;
  });

  console.log(
    `🔍 Live filter: ${matches.length} raw → ${valid.length} valid (filtered: ${filteredCount})`
  );
  return valid;
}
