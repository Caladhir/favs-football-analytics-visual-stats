// eslint-disable-next-line no-unused-vars
// src/ui/Button.jsx
import React from "react";

import { Icon } from "@iconify-icon/react";
import clsx from "clsx";

export default function Button({
  label,
  icon,
  active,
  onClick,
  className = "",
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-2 h-10 px-4 py-2.5 rounded text-sm text-clip border transition-colors transition-all duration-300  ease-out hover:scale-103",
        active
          ? "bg-red-950 text-white font-medium border-red-400"
          : "text-gray-200 border-transparent hover:border-gray-300 hover:bg-gray-700",
        className
      )}
    >
      {icon && <Icon icon={icon} width="18" height="18" />}
      {label}
    </button>
  );
}
