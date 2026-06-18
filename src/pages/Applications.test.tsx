import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/components/auth/dashboard-shell", () => ({
	DashboardShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { Applications, AuthorizedApplicationRow, ManagedOAuthClientRow } from "./Applications";

describe("Applications", () => {
	beforeEach(() => {
		vi.stubGlobal("window", {
			location: {
				origin: "https://passport.test",
			},
		});
		sessionState.user = {
			id: "admin_123",
			email: "admin@example.com",
			role: "admin",
		};
	});

	it("renders the OAuth client registration control for role admins before the client list loads", () => {
		const html = renderToStaticMarkup(<Applications />);

		expect(html).toContain("Managed clients");
		expect(html).toContain("Register client");
	});

	it("keeps OAuth client registration hidden from non-admin sessions before an admin check succeeds", () => {
		sessionState.user = {
			id: "user_123",
			email: "user@example.com",
			role: "user",
		};

		const html = renderToStaticMarkup(<Applications />);

		expect(html).not.toContain("Register client");
	});

	it("does not render a copy client ID action for authorized applications", () => {
		const html = renderToStaticMarkup(
			<AuthorizedApplicationRow
				application={{
					consentId: "consent_123",
					clientId: "client_123",
					name: "Example App",
					scopes: ["openid", "email"],
				}}
				busy={null}
				onRevoke={() => undefined}
			/>,
		);

		expect(html).toContain("client_123");
		expect(html).not.toContain("Copy client ID");
	});

	it("renders a copy client ID action for managed OAuth clients", () => {
		const html = renderToStaticMarkup(
			<ManagedOAuthClientRow
				client={{
					clientId: "managed_client_123",
					name: "Managed App",
					redirectUris: ["https://app.example.com/callback"],
					public: true,
				}}
				open={false}
				copied={false}
				onCopyClientID={() => undefined}
				onToggleExpanded={() => undefined}
			/>,
		);

		expect(html).toContain("managed_client_123");
		expect(html).toContain("Copy client ID");
	});
});
