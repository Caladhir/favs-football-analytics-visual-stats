// src/features/header/Navigation.jsx - AŽURIRANO
import { NavLink } from "react-router-dom";
import IconWithSkeleton from "./IconWithSkeleton";
import { navLinks } from "../../utils/navLinks";

export default function Navigation({ className = "" }) {
  return (
    <nav
      className={`hidden md:flex gap-10 text-lg font-medium items-center ${className}`}
    >
      {navLinks.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `flex items-center gap-2 hover:scale-[1.02] transition-all duration-300 ease-in-out hover:text-primary ${
              isActive ? "text-primary  font-bold" : "text-muted-foreground"
            }`
          }
        >
          <IconWithSkeleton icon={item.icon} width={20} height={20} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
