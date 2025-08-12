// src/utils/navLinks.js - NAVIGATION CONFIGURATION
export const navLinks = [
  {
    path: "/dashboard",
    label: "Dashboard",
    icon: "fluent-mdl2:dashboard-add",
    description: "Analytics and insights",
  },
  {
    path: "/matches",
    label: "Matches",
    icon: "ph:soccer-ball-bold",
    description: "Live, upcoming and finished matches",
    subRoutes: [
      { path: "/matches", label: "All Matches" },
      { path: "/matches/live", label: "Live" },
      { path: "/matches/upcoming", label: "Upcoming" },
      { path: "/matches/finished", label: "Finished" },
    ],
  },
  {
    path: "/teams",
    label: "Teams",
    icon: "mdi:shield-account",
    description: "Team profiles and statistics",
  },
  {
    path: "/players",
    label: "Players",
    icon: "game-icons:babyfoot-players",
    description: "Player stats and analysis",
  },
];

/**
 * Get navigation link by path
 */
export function getNavLinkByPath(path) {
  // Direct match
  const directMatch = navLinks.find((link) => link.path === path);
  if (directMatch) return directMatch;

  // Check sub-routes
  for (const link of navLinks) {
    if (link.subRoutes) {
      const subMatch = link.subRoutes.find((sub) => sub.path === path);
      if (subMatch) return { ...link, activeSubRoute: subMatch };
    }
  }

  return null;
}

/**
 * Check if path is active (including sub-routes)
 */
export function isNavLinkActive(linkPath, currentPath) {
  // Exact match
  if (linkPath === currentPath) return true;

  // Check if current path starts with link path (for sub-routes)
  if (currentPath.startsWith(linkPath) && linkPath !== "/") return true;

  return false;
}

/**
 * Get breadcrumb for current path
 */
export function getBreadcrumbForPath(path) {
  const link = getNavLinkByPath(path);
  if (!link) return [];

  const breadcrumb = [{ label: link.label, path: link.path }];

  if (link.activeSubRoute) {
    breadcrumb.push({
      label: link.activeSubRoute.label,
      path: link.activeSubRoute.path,
    });
  }

  return breadcrumb;
}
