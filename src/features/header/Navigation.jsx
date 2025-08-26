// src/features/header/Navigation.jsx - REDESIGNED WITH MODERN STYLING
import { NavLink } from "react-router-dom";
import IconWithSkeleton from "./IconWithSkeleton";
import { navLinks } from "../../utils/navLinks";

export default function Navigation({ className = "" }) {
  return (
    <nav className={`hidden md:flex items-center gap-2 ${className}`}>
      {/* Navigation container with glassmorphism */}
      <div className="flex items-center gap-1 bg-gradient-to-r from-gray-800/40 via-gray-900/60 to-gray-800/40 backdrop-blur-sm rounded-2xl p-2 border border-gray-700/30 shadow-lg">
        {navLinks.map((item, index) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `group relative overflow-hidden flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 ease-out hover:scale-105 ${
                isActive
                  ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-500/25 border border-red-500/30"
                  : "text-gray-300 hover:text-white hover:bg-gradient-to-r hover:from-gray-700/80 hover:to-gray-800/80"
              }`
            }
          >
            {/* Background glow effect for active state */}
            {({ isActive }) => (
              <>
                {isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-red-600/20 rounded-xl blur-sm -z-10" />
                )}

                {/* Hover glow effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />

                {/* Icon with enhanced styling */}
                <div className="relative z-10">
                  <IconWithSkeleton
                    icon={item.icon}
                    width={20}
                    height={20}
                    className={`transition-all duration-300 ${
                      isActive
                        ? "text-white animate-pulse"
                        : "text-gray-400 group-hover:text-white group-hover:scale-110"
                    }`}
                  />
                </div>

                {/* Text with enhanced styling */}
                <span className="relative z-10 text-sm font-bold tracking-wide">
                  {item.label}
                </span>

                {/* Active indicator dot */}
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white rounded-full shadow-lg animate-pulse" />
                )}

                {/* Hover indicator */}
                {!isActive && (
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-gray-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

// Alternative compact version for smaller screens
export function CompactNavigation({ className = "" }) {
  return (
    <nav className={`flex items-center gap-1 ${className}`}>
      {navLinks.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `group relative overflow-hidden flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 ease-out hover:scale-110 ${
              isActive
                ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-500/25"
                : "text-gray-400 hover:text-white hover:bg-gradient-to-r hover:from-gray-700/80 hover:to-gray-800/80"
            }`
          }
          title={item.label}
        >
          {({ isActive }) => (
            <>
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
              <IconWithSkeleton
                icon={item.icon}
                width={20}
                height={20}
                className="relative z-10"
              />
              {isActive && (
                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
