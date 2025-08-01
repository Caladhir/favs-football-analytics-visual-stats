import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Icon } from "@iconify-icon/react";
import SearchBar from "../features/header/SearchBar";
import IconWithSkeleton from "../features/header/IconWithSkeleton";

const navItems = [
  { name: "Dashboard", path: "/dashboard", icon: "fluent-mdl2:dashboard-add" },
  { name: "Matches", path: "/matches", icon: "ph:soccer-ball-bold" },
  { name: "Teams", path: "/teams", icon: "mdi:shield-account" },
  { name: "Players", path: "/players", icon: "game-icons:babyfoot-players" },
];

const profileItems = [
  {
    name: "Profil",
    icon: "mdi:account",
    action: () => alert("Profil soon..."),
  },
  {
    name: "Favoriti",
    icon: "mdi:heart-outline",
    action: () => alert("Favoriti soon..."),
  },
  {
    name: "Postavke",
    icon: "mdi:cog-outline",
    action: () => alert("Postavke soon..."),
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

export default function Header() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="w-full h-20 bg-[#ddc9c7] border-b border-black px-8 flex items-center justify-between z-50 relative">
      {/* Lijevo: Logo + FAVS link */}
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => navigate("/homepage")}
      >
        <img
          src="/favs-logo.svg"
          alt="FAVS Logo"
          className="h-12 w-12 rounded-full object-cover"
        />
        <span className="text-2xl font-semibold text-green-900">FAVS</span>
      </div>

      {/* Sredina: Navigacija s ikonama */}
      <nav className="hidden md:flex gap-10 text-lg font-medium text-black items-center">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-2 hover:text-green-700 transition ${
                isActive
                  ? "font-bold text-green-800 underline underline-offset-4"
                  : ""
              }`
            }
          >
            <IconWithSkeleton icon={item.icon} width={20} height={20} />
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>

      {/* Desno: Search + Profil dropdown */}
      <div className="flex items-center gap-4 relative">
        <SearchBar className="relative z-20" />

        <button
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="p-1 rounded-full hover:bg-black/10 transition"
        >
          <Icon icon="mdi:account-circle-outline" width={28} height={28} />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-14 w-52 rounded bg-white shadow-lg border z-50 p-2 space-y-1">
            {profileItems.map((item) => (
              <button
                key={item.name}
                onClick={() => {
                  item.action();
                  setDropdownOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-gray-100 rounded text-sm"
              >
                <Icon icon={item.icon} width={18} />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
