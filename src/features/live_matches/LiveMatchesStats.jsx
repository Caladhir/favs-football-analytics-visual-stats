import GroupButton from "../../ui/GroupButton";

export default function LiveMatchesStats({
  topLeaguesCount,
  favoritesCount,
  groupByCompetition,
  setGroupByCompetition,
}) {
  return (
    <div className="text-center mb-4 space-y-2">
      <p className="text-muted-foreground text-sm">
        Live football matches happening right now
      </p>

      {/* Stats row */}
      <div className="flex justify-center items-center gap-4 text-xs">
        {topLeaguesCount > 0 && (
          <span className="bg-blue-600 text-white px-2 py-1 rounded-full">
            ⭐ {topLeaguesCount} Top League{topLeaguesCount === 1 ? "" : "s"}
          </span>
        )}

        {favoritesCount > 0 && (
          <span className="bg-green-600 text-white px-2 py-1 rounded-full">
            ❤️ {favoritesCount} Favorite{favoritesCount === 1 ? "" : "s"}
          </span>
        )}

        {/* 🚀 NOVO: Group toggle s reusable komponentom */}
        <GroupButton
          isGrouped={groupByCompetition}
          onToggle={() => setGroupByCompetition(!groupByCompetition)}
          size="sm"
          groupedText="Grouped"
          ungroupedText="Group"
          variant="minimal"
        />
      </div>
    </div>
  );
}
