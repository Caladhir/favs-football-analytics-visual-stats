// src/features/header/HamburgerMenu.jsx

import { NavLink } from "react-router-dom";
import { Icon } from "@iconify-icon/react";
import IconWithSkeleton from "./IconWithSkeleton";

const navItems = [
  { name: "Dashboard", path: "/dashboard", icon: "fluent-mdl2:dashboard-add" },
  { name: "Matches", path: "/matches", icon: "ph:soccer-ball-bold" },
  { name: "Teams", path: "/teams", icon: "mdi:shield-account" },
  { name: "Players", path: "/players", icon: "game-icons:babyfoot-players" },
];

const profileItems = [
  {
    name: "Profile",
    icon: "mdi:account",
    action: () => alert("Profile soon..."),
  },
  {
    name: "Favorites",
    icon: "mdi:heart-outline",
    action: () => alert("Favorites soon..."),
  },
  {
    name: "Settings",
    icon: "mdi:cog-outline",
    action: () => alert("Settings soon..."),
  },
  {
    name: "Light/Dark mode",
    icon: "mdi:theme-light-dark",
    action: () => document.documentElement.classList.toggle("dark"),
  },
  {
    name: "Sign out",
    icon: "mdi:logout",
    action: () => alert("Sign out soon..."),
  },
];

export default function HamburgerMenu({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background text-foreground z-50 p-6 md:hidden overflow-y-auto">
      {/* Close button */}
      <div className="flex justify-end mb-6">
        <button onClick={onClose}>
          <Icon icon="mdi:close" width={28} />
        </button>
      </div>

      <div className="space-y-6">
        {/* Navigation */}
        <div className="space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 py-2 px-4 rounded hover:bg-muted transition text-lg ${
                  isActive ? "font-bold text-primary" : "text-foreground"
                }`
              }
            >
              <IconWithSkeleton icon={item.icon} width={22} height={22} />
              <span>{item.name}</span>
            </NavLink>
          ))}
        </div>

        <hr className="border-border" />

        {/* Profile actions */}
        <div className="space-y-2">
          {profileItems.map((item) => (
            <button
              key={item.name}
              onClick={() => {
                item.action();
                onClose();
              }}
              className="flex items-center gap-3 w-full py-2 px-4 rounded hover:bg-muted text-left text-base transition"
            >
              <Icon icon={item.icon} width={20} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
