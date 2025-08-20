// src/ui/SpecializedButtons.jsx - Specijalizirani gumbovi
import React from "react";
import { Icon } from "@iconify-icon/react";
import Button from "./Button";

// =============================================
// 🚀 CTA BUTTON - Za glavne akcije
// =============================================
export function CTAButton({
  children,
  className = "",
  size = "lg",
  glowColor = "red",
  ...props
}) {
  return (
    <button
      className={`
        group relative px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 
        rounded-full font-semibold text-lg overflow-hidden 
        transition-all duration-300 hover:scale-105 
        hover:shadow-2xl hover:shadow-red-500/50
        focus:outline-none focus:ring-4 focus:ring-red-500/50
        text-white border-2 border-red-500/50
        ${className}
      `}
      {...props}
    >
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-r from-red-700 to-red-800 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Glow ring */}
      <div className="absolute -inset-1 bg-gradient-to-r from-red-500 to-red-600 rounded-full blur opacity-30 group-hover:opacity-50 transition-opacity duration-300" />

      {/* Content */}
      <span className="relative z-10 flex items-center gap-3 text-center">
        {children}
        <Icon
          icon="mdi:arrow-right"
          className="w-5 h-5 transition-transform group-hover:translate-x-1"
        />
      </span>
    </button>
  );
}

// =============================================
// 🔄 REFRESH BUTTON - Za refresh akcije
// =============================================
export function RefreshButton({
  isLoading = false,
  onClick,
  size = "md",
  children = "Refresh Data",
  className = "",
  ...props
}) {
  return (
    <Button
      variant="secondary"
      size={size}
      leftIcon={isLoading ? null : "mdi:refresh"}
      isLoading={isLoading}
      onClick={onClick}
      className={`
        hover:scale-105 transition-transform duration-300
        ${isLoading ? "animate-pulse" : ""}
        ${className}
      `}
      disabled={isLoading}
      {...props}
    >
      {children}
    </Button>
  );
}

// =============================================
// 👁️ DETAILS BUTTON - Za detalje
// =============================================
export function DetailsButton({
  onClick,
  size = "sm",
  showText = true,
  className = "",
  ...props
}) {
  return (
    <Button
      variant="outline"
      size={size}
      leftIcon="mdi:eye"
      onClick={onClick}
      className={`
        hover:border-blue-500 hover:text-blue-500
        ${className}
      `}
      {...props}
    >
      {showText && "Details"}
    </Button>
  );
}

// =============================================
// 📱 ICON BUTTON - Samo ikona
// =============================================
export function IconButton({
  icon,
  size = "md",
  variant = "ghost",
  tooltip,
  className = "",
  ...props
}) {
  const sizeClasses = {
    xs: "w-6 h-6 p-1",
    sm: "w-8 h-8 p-1.5",
    md: "w-10 h-10 p-2",
    lg: "w-12 h-12 p-3",
    xl: "w-16 h-16 p-4",
  };

  return (
    <button
      className={`
        ${sizeClasses[size]}
        rounded-full transition-all duration-200
        hover:scale-110 active:scale-95
        flex items-center justify-center
        ${variant === "ghost" ? "bg-white/10 hover:bg-white/20 text-white" : ""}
        ${variant === "primary" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
        ${
          variant === "secondary"
            ? "bg-gray-600 hover:bg-gray-700 text-white"
            : ""
        }
        focus:outline-none focus:ring-2 focus:ring-blue-500/50
        ${className}
      `}
      title={tooltip}
      {...props}
    >
      <Icon icon={icon} className="w-full h-full" />
    </button>
  );
}

// =============================================
// 🌊 FLOATING ACTION BUTTON
// =============================================
export function FloatingActionButton({
  icon = "mdi:plus",
  onClick,
  position = "bottom-right",
  color = "red",
  className = "",
  children,
  ...props
}) {
  const positionClasses = {
    "bottom-right": "fixed bottom-6 right-6",
    "bottom-left": "fixed bottom-6 left-6",
    "top-right": "fixed top-6 right-6",
    "top-left": "fixed top-6 left-6",
  };

  const colorClasses = {
    red: "bg-red-600 hover:bg-red-700 shadow-red-500/25",
    blue: "bg-blue-600 hover:bg-blue-700 shadow-blue-500/25",
    green: "bg-green-600 hover:bg-green-700 shadow-green-500/25",
    purple: "bg-purple-600 hover:bg-purple-700 shadow-purple-500/25",
  };

  return (
    <button
      onClick={onClick}
      className={`
        ${positionClasses[position]}
        ${colorClasses[color]}
        w-14 h-14 rounded-full text-white
        shadow-xl hover:shadow-2xl
        transition-all duration-300 hover:scale-110 active:scale-95
        flex items-center justify-center
        focus:outline-none focus:ring-4 focus:ring-blue-500/50
        z-50 group
        ${className}
      `}
      {...props}
    >
      <Icon
        icon={icon}
        className="w-6 h-6 transition-transform group-hover:rotate-90"
      />

      {/* Tooltip */}
      {children && (
        <span className="absolute right-16 bg-gray-900 text-white px-3 py-1 rounded-lg text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
          {children}
        </span>
      )}
    </button>
  );
}

// =============================================
// 📊 STATS BUTTON - Za statistike
// =============================================
export function StatsButton({
  value,
  label,
  icon,
  trend = null, // 'up', 'down', 'neutral'
  onClick,
  className = "",
  ...props
}) {
  const trendIcons = {
    up: "mdi:trending-up",
    down: "mdi:trending-down",
    neutral: "mdi:minus",
  };

  const trendColors = {
    up: "text-green-400",
    down: "text-red-400",
    neutral: "text-gray-400",
  };

  return (
    <button
      onClick={onClick}
      className={`
        bg-white/5 hover:bg-white/10 backdrop-blur-sm
        rounded-xl p-4 text-center transition-all duration-300
        hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500/50
        border border-white/10 hover:border-white/20
        group ${className}
      `}
      {...props}
    >
      {/* Icon */}
      {icon && (
        <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">
          {typeof icon === "string" ? <Icon icon={icon} /> : icon}
        </div>
      )}

      {/* Value */}
      <div className="text-2xl font-bold text-white mb-1 group-hover:text-red-400 transition-colors">
        {value}
      </div>

      {/* Label and trend */}
      <div className="flex items-center justify-center gap-1">
        <span className="text-xs text-gray-400">{label}</span>
        {trend && (
          <Icon
            icon={trendIcons[trend]}
            className={`w-3 h-3 ${trendColors[trend]}`}
          />
        )}
      </div>
    </button>
  );
}

// =============================================
// 🎯 PILL BUTTON - Za filter opcije
// =============================================
export function PillButton({
  children,
  active = false,
  onClick,
  size = "sm",
  className = "",
  count,
  ...props
}) {
  return (
    <button
      onClick={onClick}
      className={`
        px-4 py-2 rounded-full font-medium transition-all duration-200
        border-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50
        ${
          active
            ? "bg-red-600 border-red-500 text-white shadow-lg"
            : "bg-white/10 border-white/20 text-gray-300 hover:bg-white/20 hover:text-white"
        }
        hover:scale-105 active:scale-95
        ${className}
      `}
      {...props}
    >
      <span className="flex items-center gap-2">
        {children}
        {count !== undefined && (
          <span
            className={`
            px-1.5 py-0.5 rounded-full text-xs font-bold
            ${active ? "bg-white/20" : "bg-red-500 text-white"}
          `}
          >
            {count}
          </span>
        )}
      </span>
    </button>
  );
}

// =============================================
// ⚡ QUICK ACTION BUTTONS
// =============================================
export function QuickActionButtons({ actions = [], className = "" }) {
  return (
    <div className={`flex gap-2 ${className}`}>
      {actions.map((action, index) => (
        <IconButton
          key={index}
          icon={action.icon}
          onClick={action.onClick}
          tooltip={action.tooltip}
          variant={action.variant || "ghost"}
          size="sm"
        />
      ))}
    </div>
  );
}
