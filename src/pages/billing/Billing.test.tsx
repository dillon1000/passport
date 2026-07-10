import { renderToStaticMarkup } from "react-dom/server";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BillingPlanCatalogEntry } from "@/lib/billing";

const sessionState = vi.hoisted(() => ({
	user: {
		id: "admin_123",
		email: "admin@example.com",
		role: "admin" as string | null,
	},
}));

vi.mock("@/lib/session", () => ({
	useRequireSession: () => ({
		data: {
			user: sessionState.user,
		},
	}),
}));

vi.mock("@/components/auth/billing-shell", () => ({
	BillingShell: ({ subnav, children }: { subnav?: ReactNode; children: ReactNode }) => (
		<>
			{subnav}
			{children}
		</>
	),
}));

vi.mock("@/auth-client", () => ({
	authClient: {
		organization: { list: () => Promise.resolve({ data: [] }) },
	},
}));

import { groupPlansByApp } from "@/lib/billing-groups";

import { Billing } from "./Billing";
import { createAppQueryClient } from "@/lib/query-client";

function plan(name: string, group?: string): BillingPlanCatalogEntry {
	return {
		name,
		...(group ? { group } : {}),
		entitlements: [],
		hasFreeTrial: false,
		hasAnnualDiscount: false,
		type: "subscription",
		personalOnly: false,
		hidden: false,
	};
}

describe("groupPlansByApp", () => {
	it("groups plans by app and sorts named groups before the Other bucket", () => {
		const grouped = groupPlansByApp([
			plan("free"),
			plan("pro", "Beacon"),
			plan("team", "Acme"),
			plan("starter", "Acme"),
		]);

		expect(grouped.map((entry) => entry.group)).toEqual(["Acme", "Beacon", "Other"]);
		expect(grouped[0]?.plans.map((p) => p.name)).toEqual(["team", "starter"]);
		expect(grouped.at(-1)?.group).toBe("Other");
		expect(grouped.at(-1)?.plans.map((p) => p.name)).toEqual(["free"]);
	});

	it("returns no Other bucket when every plan has a group", () => {
		const grouped = groupPlansByApp([plan("pro", "Acme")]);
		expect(grouped.map((entry) => entry.group)).toEqual(["Acme"]);
	});
});

function renderAt(path: string) {
	return renderToStaticMarkup(
		<QueryClientProvider client={createAppQueryClient()}>
			<MemoryRouter initialEntries={[path]}>
				<Billing />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("Billing", () => {
	beforeEach(() => {
		vi.stubGlobal("window", {
			location: { origin: "https://passport.test", search: "" },
		});
		sessionState.user = { id: "admin_123", email: "admin@example.com", role: "admin" };
	});

	it("renders the billing sub-nav and customer switcher on every section", () => {
		const html = renderAt("/billing");
		expect(html).toContain("Overview");
		expect(html).toContain("Purchases");
		expect(html).toContain("Personal");
		expect(html).toContain("Subscriptions");
	});

	it("renders the Add plan control for admins on the plans section", () => {
		const html = renderAt("/billing/plans");
		expect(html).toContain("Add plan");
	});

	it("only renders the active section for the current route", () => {
		const overview = renderAt("/billing");
		expect(overview).toContain("Subscriptions");
		expect(overview).not.toContain("Add plan");
	});

	it("hides the Add plan control from non-admin sessions", () => {
		sessionState.user = { id: "user_123", email: "user@example.com", role: "user" };
		const html = renderAt("/billing/plans");
		expect(html).not.toContain("Add plan");
	});
});
