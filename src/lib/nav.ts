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

/**
 * Where a path sits in the tab strips, as `[page, sub-page]`. Page transitions
 * compare two ranks to decide which way to swipe, so the content moves the same
 * direction the eye travels along the tabs. `null` for paths outside the strips.
 */
export function navRank(pathname: string): [number, number] | null {
	const page = indexOf(dashboardNav, pathname);
	if (page === null) return null;
	return [page, indexOf(billingNav, pathname) ?? 0];
}

/** The nav item that owns `pathname`, for naming the current page on a menu trigger. */
export function activeNavItem(items: NavItem[], pathname: string): NavItem | null {
	const index = indexOf(items, pathname);
	return index === null ? null : items[index];
}

/** Index of the longest nav href that owns `pathname`, so `/billing/plans` beats `/billing`. */
function indexOf(items: NavItem[], pathname: string): number | null {
	let match: number | null = null;
	let matchedLength = -1;
	items.forEach((item, index) => {
		const owns = pathname === item.href || pathname.startsWith(`${item.href}/`);
		if (owns && item.href.length > matchedLength) {
			match = index;
			matchedLength = item.href.length;
		}
	});
	return match;
}
