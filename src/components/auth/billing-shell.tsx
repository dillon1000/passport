import { useState, type ReactNode } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { DashboardNav } from "@/components/auth/dashboard-nav";
import { SignOutDialog } from "@/components/auth/sign-out-dialog";
import { UserMenu } from "@/components/auth/user-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { initialsOf } from "@/lib/session";

interface DashboardUser {
	name?: string | null;
	email: string;
	image?: string | null;
	role?: string | null;
}

/**
 * Frame for the billing routes. Like DashboardShell it renders the two-row
 * header and account menu, but adds a third billing sub-tab row, widens the
 * content well, and drops the on-page section rail — each billing area is its
 * own route, so the chrome only deepens where the content needs the room.
 */
export function BillingShell({
	user,
	title,
	description,
	subnav,
	children,
}: {
	user?: DashboardUser | null;
	title: string;
	description: string;
	/** Billing sub-tab row, rendered alongside the customer switcher. */
	subnav?: ReactNode;
	children?: ReactNode;
}) {
	const name = user?.name || "Account";
	const [signOutOpen, setSignOutOpen] = useState(false);

	return (
		<>
			<AuthShell
				width="2xl"
				breadcrumb={user ? name : <Skeleton className="h-4 w-20" />}
				nav={<DashboardNav user={user} />}
				subnav={subnav}
				actions={
					user ? (
						<UserMenu
							name={name}
							email={user.email}
							image={user.image}
							initials={initialsOf(user.name)}
							onSignOut={() => setSignOutOpen(true)}
						/>
					) : (
						<Skeleton className="size-7 rounded-full" />
					)
				}
			>
				<div className="space-y-8">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
						<p className="mt-1 text-sm text-pretty text-muted-foreground">{description}</p>
					</div>
					<div className="space-y-6">{user ? children : <ContentSkeleton />}</div>
				</div>
			</AuthShell>
			<SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
		</>
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
