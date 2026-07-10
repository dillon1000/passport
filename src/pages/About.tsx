/**
 * Public marketing/about page. Renders a product overview plus the four
 * policies (Terms, Privacy, Billing, Refund), each opened in a side-drawer
 * sheet, so they are publicly readable for payment-provider and app-store
 * verification. The page is reachable without a session; CTAs adapt to whether
 * the visitor is already signed in. Policy copy lives in `@/lib/legal`.
 */
import { useState } from "react";
import {
	ArrowRight,
	Fingerprint,
	KeyRound,
	LayoutDashboard,
	Receipt,
	RotateCcw,
	ScrollText,
	ShieldCheck,
	UserPlus,
} from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { authClient } from "@/auth-client";
import { useBrand } from "@/lib/brand-runtime";
import {
	billingPolicySections,
	legalUpdatedAt,
	privacyPolicySections,
	refundPolicySections,
	termsOfServiceSections,
	type LegalSection,
} from "@/lib/legal";

type Feature = {
	icon: typeof ShieldCheck;
	title: string;
	description: string;
};

type Policy = {
	id: string;
	icon: typeof ScrollText;
	title: string;
	summary: string;
	sections: LegalSection[];
};

const features: Feature[] = [
	{
		icon: KeyRound,
		title: "One account, every app",
		description:
			"Sign in once and authorize the apps you use over OAuth and OpenID Connect. No new password for each one.",
	},
	{
		icon: Fingerprint,
		title: "Sign in your way",
		description:
			"Passwords, passkeys, magic links, social logins, and two-factor authentication — pick what fits, stay hard to phish.",
	},
	{
		icon: ShieldCheck,
		title: "You hold the keys",
		description:
			"See where you are signed in, which apps have access, and what changed. Export or delete your data whenever you want.",
	},
];

const policies: Policy[] = [
	{
		id: "terms",
		icon: ScrollText,
		title: "Terms of Service",
		summary: "The rules for using your account and connected apps.",
		sections: termsOfServiceSections,
	},
	{
		id: "privacy",
		icon: ShieldCheck,
		title: "Privacy Policy",
		summary: "What we collect, why, and what stays yours.",
		sections: privacyPolicySections,
	},
	{
		id: "billing",
		icon: Receipt,
		title: "Billing Policy",
		summary: "How paid plans are priced, charged, and renewed.",
		sections: billingPolicySections,
	},
	{
		id: "refund",
		icon: RotateCcw,
		title: "Refund Policy",
		summary: "When you get money back, and how to ask.",
		sections: refundPolicySections,
	},
];

export function About() {
	const brand = useBrand();
	const { data: session, isPending } = authClient.useSession();
	const signedIn = Boolean(session);
	const [openPolicy, setOpenPolicy] = useState<Policy | null>(null);

	return (
		<AuthShell width="lg" breadcrumb="About">
			<div className="space-y-16">
				<section className="space-y-6">
					<div className="space-y-4">
						<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
							One login for everything you connect.
						</h1>
						<p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
							{brand.name} is the account you use to sign in to your apps. Make one, lock it
							down with passkeys and two-factor authentication, and decide exactly what each
							app can see — all from one dashboard.
						</p>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						{isPending ? (
							<>
								<Skeleton className="h-10 w-36 rounded-lg" />
								<Skeleton className="h-10 w-28 rounded-lg" />
							</>
						) : signedIn ? (
							<Button asChild size="lg">
								<a href="/account">
									<LayoutDashboard className="size-4" aria-hidden="true" />
									Open dashboard
								</a>
							</Button>
						) : (
							<>
								<Button asChild size="lg">
									<a href="/sign-in">
										Sign in
										<ArrowRight className="size-4" aria-hidden="true" />
									</a>
								</Button>
								<Button asChild size="lg" variant="outline">
									<a href="/sign-in?flow=add-account">
										<UserPlus className="size-4" aria-hidden="true" />
										Add an account
									</a>
								</Button>
							</>
						)}
					</div>
				</section>

				<section className="space-y-6">
					<h2 className="text-lg font-semibold tracking-tight">Why {brand.name}</h2>
					<div className="grid gap-4 sm:grid-cols-3">
						{features.map((feature) => (
							<Card key={feature.title} className="h-full">
								<CardContent className="space-y-3">
									<span className="grid size-10 place-items-center rounded-xl border bg-muted/40 text-foreground">
										<feature.icon className="size-5" aria-hidden="true" />
									</span>
									<h3 className="text-sm font-medium">{feature.title}</h3>
									<p className="text-sm leading-relaxed text-muted-foreground">
										{feature.description}
									</p>
								</CardContent>
							</Card>
						))}
					</div>
				</section>

				<section className="space-y-6">
					<div className="space-y-2">
						<h2 className="text-lg font-semibold tracking-tight">Policies</h2>
						<p className="text-sm text-muted-foreground">
							The fine print, kept short. Updated {legalUpdatedAt} — tap any to read it.
						</p>
					</div>

					<div className="grid gap-3 sm:grid-cols-2">
						{policies.map((policy) => (
							<PolicyButton
								key={policy.id}
								policy={policy}
								onClick={() => setOpenPolicy(policy)}
							/>
						))}
					</div>
				</section>
			</div>

			<PolicySheet
				policy={openPolicy}
				onOpenChange={(open) => !open && setOpenPolicy(null)}
			/>
		</AuthShell>
	);
}

function PolicyButton({ policy, onClick }: { policy: Policy; onClick: () => void }) {
	const Icon = policy.icon;
	return (
			<button
				type="button"
				onClick={onClick}
				className="flex items-start gap-3 rounded-lg border px-3 py-3 text-left shadow-sm shadow-black/[0.04] transition-[scale,background-color,box-shadow] duration-150 ease-out hover:bg-muted/50 hover:shadow-black/[0.06] active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
			>
			<Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<span className="min-w-0">
				<span className="block text-sm font-medium">{policy.title}</span>
				<span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
					{policy.summary}
				</span>
			</span>
		</button>
	);
}

function PolicySheet({
	policy,
	onOpenChange,
}: {
	policy: Policy | null;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Sheet open={policy !== null} onOpenChange={onOpenChange}>
			<SheetContent className="max-w-xl">
				<SheetHeader>
					<SheetTitle>{policy?.title}</SheetTitle>
					<SheetDescription>Updated {legalUpdatedAt}</SheetDescription>
				</SheetHeader>
				<SheetBody className="space-y-6">
					{policy?.sections.map((section) => (
						<section key={section.title} className="space-y-2">
							<h3 className="text-sm font-medium">{section.title}</h3>
							{section.body.map((paragraph) => (
								<p key={paragraph} className="text-sm leading-6 text-muted-foreground">
									{paragraph}
								</p>
							))}
						</section>
					))}
				</SheetBody>
			</SheetContent>
		</Sheet>
	);
}
