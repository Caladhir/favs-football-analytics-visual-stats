// src/ui/Header.jsx - REDESIGNED WITH MODERN STYLING
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify-icon/react";

// SearchBar & ProfileDropdown temporarily hidden per request
import SearchBar from "../features/header/SearchBar";
import ProfileDropdown from "../features/header/ProfileDropdown";
import Navigation from "../features/header/Navigation";
import HamburgerMenu from "../features/header/HamburgerMenu";

export default function Header() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const dropdownRef = useRef();
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 w-full h-20 bg-gradient-to-r from-black/95 via-gray-900/95 to-black/95 backdrop-blur-xl border-b border-red-500/20 px-6 flex items-center justify-between z-50 shadow-lg shadow-black/20">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-2 -left-20 w-40 h-8 bg-gradient-to-r from-red-500/10 to-transparent blur-xl animate-pulse" />
        <div className="absolute -top-2 -right-20 w-40 h-8 bg-gradient-to-l from-red-500/10 to-transparent blur-xl animate-pulse animation-delay-2000" />
      </div>

      {/* Left: Enhanced Logo + Brand */}
      <div
        className="group flex items-center gap-4 cursor-pointer transition-all duration-300 ease-out relative z-10"
        onClick={() => navigate("/")}
      >
        {/* Logo with glow effect */}
        <div className="relative">
          <div className="absolute inset-0 bg-red-500/20 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <img
            src="/favs-logo.svg"
            alt="FAVS Logo"
            className="relative h-12 w-12 rounded-full object-cover ring-2 ring-red-500/30 group-hover:ring-red-500/60 transition-all duration-300 group-hover:scale-110"
          />
        </div>

        {/* Brand name with gradient */}
        <div className="flex flex-col">
          <span className="text-2xl font-black bg-gradient-to-r from-red-400 via-white to-red-400 bg-clip-text text-transparent group-hover:from-red-300 group-hover:to-red-300 transition-all duration-300">
            F.A.V.S.
          </span>
          <span className="text-xs text-gray-400 font-medium tracking-wider group-hover:text-gray-300 transition-colors duration-300">
            Football Analytics
          </span>
        </div>
      </div>

      {/* Center: Enhanced Navigation for desktop */}
      <div className="flex-1 flex justify-center relative z-10">
        <Navigation />
      </div>

      {/* Right: Enhanced Controls */}
      <div className="flex items-center gap-4 relative z-10">
        {/* Search Bar hidden */}
        {/* <div className="relative">
          <SearchBar className="w-32 sm:w-48 md:w-64" />
        </div> */}

        {/* Profile dropdown hidden */}
        {/* <div ref={dropdownRef} className="relative hidden md:block">
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="group relative overflow-hidden p-3 rounded-full bg-gradient-to-r from-gray-700/50 to-gray-800/50 border border-gray-600/30 hover:from-red-600/80 hover:to-red-700/80 hover:border-red-500/40 transition-all duration-300 hover:scale-110 shadow-lg backdrop-blur-sm"
          >
            <div className="absolute py-0.5 inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full" />
            <Icon
              icon="mdi:account-circle-outline"
              width={24}
              height={24}
              className="relative z-10 text-gray-300 group-hover:text-white transition-colors duration-300"
            />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 top-16 z-50">
              <ProfileDropdown onItemClick={() => setDropdownOpen(false)} />
            </div>
          )}
        </div> */}

        {/* Hamburger Menu (kept) */}
        <button
          className="md:hidden group relative overflow-hidden p-3 rounded-full bg-gradient-to-r from-gray-700/50 to-gray-800/50 border border-gray-600/30 hover:from-red-600/80 hover:to-red-700/80 hover:border-red-500/40 transition-all duration-300 hover:scale-110 shadow-lg backdrop-blur-sm"
          onClick={() => setMobileNavOpen((prev) => !prev)}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full" />
          <Icon
            icon={mobileNavOpen ? "mdi:close" : "mdi:menu"}
            width={24}
            height={24}
            className="relative z-10 text-gray-300 group-hover:text-white transition-all duration-300"
          />
        </button>
      </div>

      {/* Enhanced Mobile Navigation */}
      <HamburgerMenu
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
    </header>
  );
}
