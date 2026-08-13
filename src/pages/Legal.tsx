/**
 * Public legal-policy page. The route selects a fixed Passport policy so links
 * can be shared directly without opening the About page's temporary drawer.
 */
import { ShieldCheck, ScrollText } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
	legalUpdatedAt,
	privacyPolicySections,
	termsOfServiceSections,
} from "@/lib/legal";

export function Legal({ policy }: { policy: "privacy" | "terms" }) {
	const privacy = policy === "privacy";
	const Icon = privacy ? ShieldCheck : ScrollText;
	const title = privacy ? "Privacy Policy" : "Terms of Service";
	const sections = privacy ? privacyPolicySections : termsOfServiceSections;

	return (
		<AuthShell width="md" breadcrumb={title}>
			<div className="space-y-6">
				<div className="space-y-2">
					<Icon className="size-5 text-muted-foreground" aria-hidden="true" />
					<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
					<p className="text-sm text-muted-foreground">Updated {legalUpdatedAt}</p>
				</div>
				<Card>
					<CardContent className="space-y-7">
						{sections.map((section) => (
							<section key={section.title} className="space-y-2">
								<h2 className="text-sm font-medium">{section.title}</h2>
								{section.body.map((paragraph) => (
									<p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
										{paragraph}
									</p>
								))}
							</section>
						))}
					</CardContent>
				</Card>
			</div>
		</AuthShell>
	);
}
