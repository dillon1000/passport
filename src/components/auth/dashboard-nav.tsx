import { NavLink } from "react-router";

import { dashboardNavForUser, type DashboardUserForNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Vercel-style secondary tab strip: page links with a sliding underline on the
 * active page that sits on the header's bottom border. Plain anchors, so they
 * work without JS and are fully keyboard accessible.
 */
export function DashboardNav({ user }: { user?: DashboardUserForNav | null }) {
	return (
		<nav
			aria-label="Primary"
			className="flex max-w-full items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			{dashboardNavForUser(user).map((item) => (
				<NavLink
					key={item.href}
					to={item.href}
					className="relative flex h-11 items-center px-1"
				>
					{({ isActive }) => (
						<>
							<span
								className={cn(
									"rounded-md px-2.5 py-1.5 text-sm transition-colors",
									isActive
										? "font-medium text-foreground"
										: "text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								{item.label}
							</span>
							{isActive ? (
								<span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-foreground" />
							) : null}
						</>
					)}
				</NavLink>
			))}
		</nav>
	);
}
