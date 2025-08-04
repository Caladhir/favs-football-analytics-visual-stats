import { Icon } from "@iconify-icon/react";

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

export default function ProfileDropdown({ onItemClick }) {
  return (
    <div className="absolute right-0 mt-2 w-52 rounded bg-card bg-red-500 shadow-lg z-50 p-2 border border-border space-y-1">
      {profileItems.map((item) => (
        <button
          key={item.name}
          onClick={() => {
            item.action();
            onItemClick?.(); // Zatvori dropdown ako je definiran
          }}
          className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted rounded text-ou"
        >
          <Icon icon={item.icon} width={20} />
          <span>{item.name}</span>
        </button>
      ))}
    </div>
  );
}
