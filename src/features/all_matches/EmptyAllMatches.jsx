// src/features/all_matches/EmptyAllMatches.jsx - DODATI DEBUGGING
import React, { useEffect } from "react";
import CalendarPopover from "../tabs/CalendarPopover";

export default function EmptyAllMatches({
  selectedDate,
  setSelectedDate,
  onRefresh,
}) {
  // 🔧 DODANO: Debug logging za praćenje problema
  useEffect(() => {
    console.log("🐛 EmptyAllMatches Debug:", {
      selectedDate: selectedDate?.toISOString(),
      selectedDateString: selectedDate?.toDateString(),
      timestamp: Date.now(),
    });
  }, [selectedDate]);

  const isToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    return today.getTime() === selected.getTime();
  };

  const getEmptyMessage = () => {
    if (isToday()) return "Nema utakmica danas";

    // 🔧 DODANO: Provjeri je li datum u budućnosti
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);

    if (selected > today) {
      return "Nema najavljenih utakmica za ovaj datum";
    }

    return "Nema utakmica za odabrani datum";
  };

  const getSuggestion = () => {
    const today = new Date();
    const selected = new Date(selectedDate);

    if (selected.toDateString() === today.toDateString()) {
      return "Možda trenutno nema utakmica. Pokušajte provjeriti sutra ili neki drugi datum.";
    }

    return "Pokušajte odabrati drugi datum ili osvježiti podatke.";
  };

  // Quick actions s 🔧 POPRAVKOM: Clean date creation
  const getQuickActions = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    return [
      {
        label: "Danas",
        date: today,
        disabled: selectedDate.toDateString() === today.toDateString(),
        icon: "📅",
        color: "from-blue-500 to-blue-600",
      },
      {
        label: "Jučer",
        date: yesterday,
        disabled: selectedDate.toDateString() === yesterday.toDateString(),
        icon: "🌅",
        color: "from-orange-500 to-orange-600",
      },
      {
        label: "Sutra",
        date: tomorrow,
        disabled: selectedDate.toDateString() === tomorrow.toDateString(),
        icon: "🌄",
        color: "from-purple-500 to-purple-600",
      },
    ];
  };

  return (
    <div className="relative min-h-screen">
      {/* Status Badge */}
      <div className="flex justify-center pt-6">
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 text-white px-6 py-3 rounded-full text-sm font-bold shadow-lg backdrop-blur-sm border border-gray-600/30">
          📅 Sve utakmice - {selectedDate.toLocaleDateString("hr-HR")}
        </div>
      </div>

      {/* Date picker */}
      <CalendarPopover date={selectedDate} setDate={setSelectedDate} />

      {/* Empty State Content */}
      <div className="text-center mt-16 px-6">
        {/* Icon */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-red-500/20 to-red-600/30 backdrop-blur-sm border border-red-500/30 mb-6">
            <span className="text-6xl">📅</span>
          </div>
        </div>

        {/* Main message */}
        <h2 className="text-4xl font-black text-white mb-4 bg-gradient-to-r from-red-400 via-white to-red-400 bg-clip-text text-transparent">
          {getEmptyMessage()}
        </h2>

        <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
          {getSuggestion()}
        </p>

        {/* Quick date actions */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          {getQuickActions().map((action) => (
            <button
              key={action.label}
              onClick={() => {
                console.log(
                  `🔄 Quick action clicked: ${action.label}`,
                  action.date
                );
                setSelectedDate(action.date);
              }}
              disabled={action.disabled}
              className={`
                group relative overflow-hidden px-6 py-4 rounded-xl font-semibold transition-all duration-300 flex items-center gap-3 min-w-[140px] justify-center shadow-lg hover:shadow-2xl
                ${
                  action.disabled
                    ? "bg-gray-700/50 text-gray-500 cursor-not-allowed"
                    : `bg-gradient-to-r ${action.color} hover:scale-105 text-white`
                }
              `}
            >
              <span className="text-2xl">{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>

        {/* 🔧 DODANO: Debug info u development mode */}
        {process.env.NODE_ENV === "development" && (
          <div className="mt-8 p-4 bg-gray-900/50 rounded-lg text-left text-sm text-gray-400">
            <h4 className="text-white mb-2">Debug informacije:</h4>
            <div>Selected Date: {selectedDate.toISOString()}</div>
            <div>Date String: {selectedDate.toDateString()}</div>
            <div>Is Today: {isToday().toString()}</div>
          </div>
        )}

        {/* Refresh button */}
        {onRefresh && (
          <button
            onClick={() => {
              console.log("🔄 Manual refresh clicked");
              onRefresh();
            }}
            className="px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-105"
          >
            🔄 Osvježi podatke
          </button>
        )}
      </div>
    </div>
  );
}
