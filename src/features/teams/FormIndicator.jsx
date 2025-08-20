// src/components/teams/FormIndicator.jsx
import React from "react";

export default function FormIndicator({ form = [] }) {
  const getFormColor = (result) => {
    switch (result) {
      case "W":
        return "bg-green-500";
      case "D":
        return "bg-yellow-500";
      case "L":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getFormLabel = (result) => {
    switch (result) {
      case "W":
        return "Win";
      case "D":
        return "Draw";
      case "L":
        return "Loss";
      default:
        return "Unknown";
    }
  };

  if (!form || form.length === 0) {
    return (
      <div className="flex gap-1">
        {[...Array(5)].map((_, idx) => (
          <div
            key={idx}
            className="w-4 h-4 rounded-full bg-gray-700 opacity-30"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      {form.slice(0, 5).map((result, idx) => (
        <div
          key={idx}
          className={`w-4 h-4 rounded-full ${getFormColor(
            result
          )} text-xs flex items-center justify-center text-white font-bold transition-transform hover:scale-110`}
          title={getFormLabel(result)}
        >
          {result}
        </div>
      ))}
    </div>
  );
}
