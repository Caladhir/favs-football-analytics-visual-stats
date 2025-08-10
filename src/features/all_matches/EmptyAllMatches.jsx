import CalendarPopover from "../../features/tabs/CalendarPopover";

export default function EmptyAllMatches({ selectedDate, setSelectedDate }) {
  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      <div className="flex justify-center my-4 gap-4">
        <CalendarPopover date={selectedDate} setDate={setSelectedDate} />
      </div>
      <div className="text-center mt-12">
        <div className="text-6xl mb-4">📅</div>
        <p className="text-foreground font-black text-2xl mb-2">
          No matches on this day
        </p>
        <p className="text-muted-foreground">
          Try selecting a different date to see matches.
        </p>
        <p className="text-muted-foreground text-sm mt-2">
          Or check if there are any live matches happening right now.
        </p>
      </div>
    </div>
  );
}
