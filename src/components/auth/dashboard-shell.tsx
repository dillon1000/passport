import type { ReactNode } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { DashboardNav } from "@/components/auth/dashboard-nav";
import { SectionNav, type Section } from "@/components/auth/section-nav";
import { UserMenu } from "@/components/auth/user-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { initialsOf, signOut } from "@/lib/session";

interface DashboardUser {
	name?: string | null;
	email: string;
	image?: string | null;
}

/**
 * Shared frame for every authenticated page. The chrome (header, page tabs,
 * heading, section rail) renders immediately and stays identical whether the
 * session is still loading or resolved — only the account menu and the content
 * fill in — so navigating between pages doesn't reflow the layout.
 */
export function DashboardShell({
	user,
	title,
	description,
	sections,
	children,
}: {
	/** Resolved session user, or undefined while the session loads. */
	user?: DashboardUser | null;
	title: string;
	description: string;
	sections?: Section[];
	children?: ReactNode;
}) {
	const name = user?.name || "Account";

	return (
		<AuthShell
			width="xl"
			breadcrumb={user ? name : <Skeleton className="h-4 w-20" />}
			nav={<DashboardNav />}
			actions={
				user ? (
					<UserMenu
						name={name}
						email={user.email}
						image={user.image}
						initials={initialsOf(user.name)}
						onSignOut={signOut}
					/>
				) : (
					<Skeleton className="size-7 rounded-full" />
				)
			}
		>
			<div className="space-y-8">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
					<p className="mt-1 text-sm text-muted-foreground">{description}</p>
				</div>

				{sections ? (
					<div className="grid gap-8 lg:grid-cols-[180px_1fr]">
						<aside className="hidden lg:block">
							<SectionNav sections={sections} />
						</aside>
						<div className="min-w-0 space-y-6">{user ? children : <ContentSkeleton />}</div>
					</div>
				) : (
					<div className="space-y-6">{user ? children : <ContentSkeleton />}</div>
				)}
			</div>
		</AuthShell>
	);
}

function ContentSkeleton() {
	return (
		<>
			<Skeleton className="h-32 w-full rounded-xl" />
			<Skeleton className="h-24 w-full rounded-xl" />
		</>
	);
}
