import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import IconWithSkeleton from "./IconWithSkeleton";
import ThemeToggleButton from "../../ui/ThemeToggleButton";

const ICON_SIZE = 28;

const navLinks = [
  { path: "/dashboard", label: "Dashboard", icon: "fluent-mdl2:dashboard-add" },
  { path: "/matches", label: "Matches", icon: "ph:soccer-ball-bold" },
  { path: "/teams", label: "Teams", icon: "mdi:shield-account" },
  { path: "/players", label: "Players", icon: "game-icons:babyfoot-players" },
];

function Navigation({ isNavActive, setIsNavActive }) {
  const location = useLocation();

  useEffect(() => {
    if (isNavActive) setIsNavActive(false);
  }, [location.pathname]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black z-40 transition-opacity duration-300 ease-in-out ${
          isNavActive
            ? "opacity-50 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsNavActive(false)}
      />
      <nav
        className={`fixed inset-y-0 left-0 lg:w-64 w-full text-white transform transition-all duration-300 ease-in-out z-50 ${
          isNavActive ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full bg-slate-900 pt-6 pb-6 px-6">
          <div className="flex items-center justify-center h-10 mb-6">
            <IconWithSkeleton
              icon="mdi:menu"
              width={36}
              height={36}
              onClick={() => setIsNavActive(false)}
              className="cursor-pointer"
            />
          </div>

          {navLinks.map(({ path, label, icon }) => (
            <NavLink
              key={path}
              to={path}
              className="flex items-center gap-3 mb-4 hover:text-white h-10"
              onClick={() => setIsNavActive(false)}
            >
              <IconWithSkeleton
                icon={icon}
                width={ICON_SIZE}
                height={ICON_SIZE}
              />
              <span>{label}</span>
            </NavLink>
          ))}

          <hr className="border-t w-full border-white/30 my-4" />
          <ThemeToggleButton />
        </div>
      </nav>
    </>
  );
}

export default Navigation;
