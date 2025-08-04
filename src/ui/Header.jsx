import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify-icon/react";

import SearchBar from "../features/header/SearchBar";
import ProfileDropdown from "../features/header/ProfileDropdown";
import Navigation from "../features/header/Navigation";
import HamburgerMenu from "../features/header/HamburgerMenu";

export default function Header() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const dropdownRef = useRef();
  const navigate = useNavigate();

  // Zatvori dropdown kad klikneš van njega
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
    <header className="w-full h-20 bg-background border-b border-border px-6 flex items-center justify-between z-50 relative">
      {/* Lijevo: Logo + Naziv */}
      <div
        className="flex items-center gap-3 cursor-pointer transition-all duration-300 ease-in-out "
        onClick={() => navigate("/")}
      >
        <img
          src="/favs-logo.svg"
          alt="FAVS Logo"
          className="h-10 w-10 rounded-full object-cover"
        />
        <span className="text-2xl font-semibold hover:text-primary transition-all duration-300 ease-in-out ">
          FAVS
        </span>
      </div>

      {/* Sredina: Navigacija za desktop */}
      <Navigation />

      {/* Desno: Search + Avatar + Hamburger */}
      <div className="flex items-center gap-4 relative ">
        <SearchBar className="relative z-20 block w-32 sm:w-48 md:w-60 " />

        {/* Profil avatar dropdown */}
        <div ref={dropdownRef} className="relative hidden md:block ">
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="rounded-full px-1 p-0.5 hover:bg-accent transition-all duration-300 ease-in-out"
          >
            <Icon icon="mdi:account-circle-outline" width={28} height={28} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-12 z-50">
              <ProfileDropdown onItemClick={() => setDropdownOpen(false)} />
            </div>
          )}
        </div>

        {/* Hamburger meni za mobilni prikaz */}
        <button
          className="md:hidden flex items-center justify-center p-2"
          onClick={() => setMobileNavOpen((prev) => !prev)}
        >
          <Icon icon="mdi:menu" width={28} height={28} />
        </button>
      </div>

      {/* Mobilna navigacija */}
      <HamburgerMenu
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
    </header>
  );
}
