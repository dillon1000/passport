import { DashboardShell } from "@/components/auth/dashboard-shell";
import type { Section } from "@/components/auth/section-nav";

const SECTIONS: Section[] = [
	{ id: "profile", label: "Profile" },
	{ id: "email", label: "Email" },
	{ id: "picture", label: "Picture" },
	{ id: "user-id", label: "User ID" },
];

export function ScratchShell() {
	return (
		<DashboardShell
			user={{ name: "Ada Lovelace", email: "ada@example.com", role: "admin" }}
			title="Account"
			description="Your profile, email addresses, and picture."
			sections={SECTIONS}
		>
			{SECTIONS.map((section) => (
				<section key={section.id} id={section.id} className="rounded-xl border p-4">
					<h2 className="text-sm font-medium">{section.label}</h2>
					<p className="mt-2 h-64 text-sm text-muted-foreground">Filler for {section.label}.</p>
				</section>
			))}
		</DashboardShell>
	);
}
