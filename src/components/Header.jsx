import { useLocation, useNavigate } from "react-router-dom";
import Button from "../ui/Button";
import { Icon } from "@iconify-icon/react";
import { Link } from "react-router-dom";

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    {
      name: "Dashboard",
      path: "/dashboard",
      icon: "fluent-mdl2:dashboard-add",
    },
    {
      name: "Matches",
      path: "/matches",
      icon: "ph:soccer-ball-bold",
    },
    {
      name: "Teams",
      path: "/teams",
      icon: "mdi:shield-account",
    },
    {
      name: "Players",
      path: "/players",
      icon: "mdi:soccer",
    },
  ];

  return (
    <header className="border-b border-border bg-[#392a2b]">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo + Naziv */}
          <Link to="/" className="flex items-center space-x-3">
            <img
              src="/favs-logo.svg"
              alt="Logo"
              className="h-7 w-7 object-contain"
            />
            <span className="text-xl md:text-2xl font-bold text-white">
              Football Analytics & Visual Stats
            </span>
          </Link>

          {/* Navigacija */}
          <nav className="flex gap-3">
            {navItems.map((item) => (
              <Button
                key={item.path}
                label={item.name}
                icon={item.icon}
                active={location.pathname === item.path}
                onClick={() => navigate(item.path)}
              />
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
