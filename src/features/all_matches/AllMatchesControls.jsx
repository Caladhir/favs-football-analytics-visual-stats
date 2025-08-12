// src/features/all_matches/AllMatchesControls.jsx
import GroupButton from "../../ui/GroupButton";

export default function AllMatchesControls({
  topLeaguesCount,
  groupByCompetition,
  setGroupByCompetition,
}) {
  return (
    <div className="text-center mb-4 space-y-2">
      {/* Stats row */}
      <div className="flex justify-center items-center gap-4 text-xs">
        {topLeaguesCount > 0 && (
          <span className="bg-blue-600 text-white px-2 py-1 rounded-full">
            ⭐ {topLeaguesCount} Top League{topLeaguesCount === 1 ? "" : "s"}
          </span>
        )}

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
