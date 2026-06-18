export interface NavItem {
	href: string;
	label: string;
	adminOnly?: boolean;
}

export interface DashboardUserForNav {
	role?: string | null;
}

/** Top-level dashboard pages shown in the header tab strip. Add a page here. */
export const dashboardNav: NavItem[] = [
	{ href: "/account", label: "Account" },
	{ href: "/security", label: "Security" },
	{ href: "/sessions", label: "Sessions" },
	{ href: "/organizations", label: "Organizations" },
	{ href: "/applications", label: "Applications" },
	{ href: "/agents", label: "Agents" },
	{ href: "/admin/users", label: "Users", adminOnly: true },
	{ href: "/admin/audit", label: "Audit", adminOnly: true },
	{ href: "/admin/webhooks", label: "Webhooks", adminOnly: true },
	{ href: "/settings", label: "Settings" },
];

export function dashboardNavForUser(user?: DashboardUserForNav | null) {
	return dashboardNav.filter((item) => !item.adminOnly || user?.role === "admin");
}
