// 🚀 2. src/components/AllMatches/AllMatchesHeader.jsx
import CalendarPopover from "../../features/tabs/CalendarPopover";

export default function AllMatchesHeader({ selectedDate, setSelectedDate }) {
  return (
    <div className="flex justify-center my-4 gap-4">
      <CalendarPopover date={selectedDate} setDate={setSelectedDate} />
    </div>
  );
}
