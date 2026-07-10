import { NavLink } from "react-router";

import { billingNavForUser, type DashboardUserForNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Billing-scoped tab strip rendered as a third header row. Quieter than the
 * primary DashboardNav so it reads as a sub-level. Plain anchors, keyboard
 * accessible, and `end` on the index route so Overview doesn't stay active on
 * its child routes.
 */
export function BillingNav({ user }: { user?: DashboardUserForNav | null }) {
	return (
		<nav
			aria-label="Billing sections"
			className="flex max-w-full items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			{billingNavForUser(user).map((item) => (
				<NavLink
					key={item.href}
					to={item.href}
					end={item.href === "/billing"}
					className="relative flex h-10 items-center px-1"
				>
					{({ isActive }) => (
						<>
							<span
								className={cn(
									"rounded-md px-2.5 py-1 text-[0.8125rem] transition-colors",
									isActive
										? "font-medium text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{item.label}
							</span>
							{isActive ? (
								<span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-foreground/70" />
							) : null}
						</>
					)}
				</NavLink>
			))}
		</nav>
	);
}
