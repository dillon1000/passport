import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
	AuthorizedApplicationRow,
	ManagedOAuthClientRow,
} from "./Applications";
import { canShowManagedOAuthClients } from "@/pages/applications-permissions";

describe("Applications", () => {
	it("shows managed OAuth clients to role admins before the client list loads", () => {
		expect(canShowManagedOAuthClients({ role: "admin" }, { adminAvailable: false })).toBe(true);
	});

	it("keeps managed OAuth clients hidden from non-admin sessions before an admin check succeeds", () => {
		expect(canShowManagedOAuthClients({ role: "user" }, { adminAvailable: false })).toBe(false);
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
				copied={false}
				onCopyClientID={() => undefined}
				onEdit={() => undefined}
			/>,
		);

		expect(html).toContain("managed_client_123");
		expect(html).toContain("Copy client ID");
		expect(html).toContain("Edit Managed App");
		expect(html).not.toContain("aria-expanded");
	});

	it("labels managed machine-to-machine clients", () => {
		const html = renderToStaticMarkup(
			<ManagedOAuthClientRow
				client={{
					clientId: "m2m_client_123",
					name: "Worker Job",
					redirectUris: [],
					public: false,
					grantTypes: ["client_credentials"],
				}}
				copied={false}
				onCopyClientID={() => undefined}
				onEdit={() => undefined}
			/>,
		);

		expect(html).toContain("Worker Job");
		expect(html).toContain("M2M");
	});
});
