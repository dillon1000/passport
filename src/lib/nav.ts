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
	{ href: "/billing", label: "Billing" },
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

/** Billing-scoped sub-pages shown in the third header row on /billing routes. */
export const billingNav: NavItem[] = [
	{ href: "/billing", label: "Overview" },
	{ href: "/billing/plans", label: "Plans" },
	{ href: "/billing/purchases", label: "Purchases" },
];

export function billingNavForUser(user?: DashboardUserForNav | null) {
	return billingNav.filter((item) => !item.adminOnly || user?.role === "admin");
}
