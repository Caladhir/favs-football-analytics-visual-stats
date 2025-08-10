// src/components/AllMatches/AllMatchesControls.jsx - BEZ LIVE COUNT
import GroupButton from "../../ui/GroupButton";

export default function AllMatchesControls({
  topLeaguesCount,
  groupByCompetition,
  setGroupByCompetition,
}) {
  return (
    <div className="flex justify-center items-center gap-4 mb-4 flex-wrap">
      {/* Top leagues indicator */}
      {topLeaguesCount > 0 && (
        <div className="bg-blue-600 text-white px-3 py-2 rounded-full text-xs font-medium flex items-center shadow-lg">
          ⭐ {topLeaguesCount} Top League{" "}
          {topLeaguesCount === 1 ? "Match" : "Matches"}
        </div>
      )}

      {/* Group toggle */}
      <GroupButton
        isGrouped={groupByCompetition}
        onToggle={() => setGroupByCompetition(!groupByCompetition)}
        size="sm"
        groupedText="Grouped"
        ungroupedText="Group"
      />
    </div>
  );
}
