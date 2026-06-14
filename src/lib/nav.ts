export interface NavItem {
	href: string;
	label: string;
}

/** Top-level dashboard pages shown in the header tab strip. Add a page here. */
export const dashboardNav: NavItem[] = [
	{ href: "/account", label: "Account" },
	{ href: "/security", label: "Security" },
	{ href: "/sessions", label: "Sessions" },
	{ href: "/organizations", label: "Organizations" },
	{ href: "/applications", label: "Applications" },
	{ href: "/agents", label: "Agents" },
];
