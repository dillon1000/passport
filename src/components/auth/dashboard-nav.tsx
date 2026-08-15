import { useState } from "react";
import { NavLink, useLocation } from "react-router";

import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/kumo/primitives/sheet";
import { Menu } from "@/lib/icons";
import { activeNavItem, dashboardNavForUser, type DashboardUserForNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Primary page navigation. Below `md` the tab strip can't show its later items
 * without clipping them mid-word, so phones get a menu naming the current page
 * instead; wider screens keep the Vercel-style tab strip with a sliding
 * underline on the active page that sits on the header's bottom border. Both
 * are plain anchors, so they work without JS and stay keyboard accessible.
 */
export function DashboardNav({ user }: { user?: DashboardUserForNav | null }) {
	const items = dashboardNavForUser(user);

	return (
		<>
			<DashboardNavMenu items={items} />
			<nav
				aria-label="Primary"
				className="hidden max-w-full items-center gap-0.5 overflow-x-auto [scrollbar-width:none] md:flex [&::-webkit-scrollbar]:hidden"
			>
				{items.map((item) => (
					<NavLink key={item.href} to={item.href} className="relative flex h-11 items-center px-1">
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
		</>
	);
}

/** Phone-width primary nav: a trigger naming the current page over a sheet of every page. */
function DashboardNavMenu({ items }: { items: ReturnType<typeof dashboardNavForUser> }) {
	const { pathname } = useLocation();
	const [open, setOpen] = useState(false);
	const current = activeNavItem(items, pathname);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger
				render={
					<button
						type="button"
						aria-label={`Open navigation — currently ${current?.label ?? "Account"}`}
						className="flex h-11 w-full items-center gap-2 px-1.5 text-sm md:hidden"
					>
						<Menu aria-hidden className="size-4 shrink-0 text-muted-foreground" />
						<span className="min-w-0 truncate font-medium">{current?.label ?? "Account"}</span>
					</button>
				}
			/>
			<SheetContent className="!h-auto !max-h-[min(75dvh,34rem)]">
				<SheetHeader>
					<SheetTitle>Navigation</SheetTitle>
				</SheetHeader>
				<SheetBody className="!py-3">
					<nav aria-label="Primary">
						<ul className="flex flex-col gap-0.5">
							{items.map((item) => (
								<li key={item.href}>
									<NavLink
										to={item.href}
										onClick={() => setOpen(false)}
										className={({ isActive }) =>
											cn(
												"flex min-h-11 items-center rounded-md px-3 text-sm transition-colors duration-150 ease-out active:scale-[0.98]",
												isActive
													? "bg-accent font-medium text-foreground"
													: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
											)
										}
									>
										{item.label}
									</NavLink>
								</li>
							))}
						</ul>
					</nav>
				</SheetBody>
			</SheetContent>
		</Sheet>
	);
}
