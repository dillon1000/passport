import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DeviceSessionRow } from "./Sessions";

describe("DeviceSessionRow", () => {
	it("renders the current account without switch or revoke controls", () => {
		const html = renderToStaticMarkup(
			<DeviceSessionRow
				deviceSession={{
					session: {
						id: "session_1",
						token: "token_1",
						expiresAt: new Date("2026-01-01T00:00:00Z"),
					},
					user: {
						id: "user_1",
						name: "Casey Current",
						email: "casey@example.com",
					},
				}}
				currentUserId="user_1"
				busy={false}
				onSetActive={() => undefined}
				onRevoke={() => undefined}
			/>,
		);

		expect(html).toContain("Casey Current");
		expect(html).toContain("casey@example.com");
		expect(html).toContain("Current account");
		expect(html).not.toContain("Switch");
		expect(html).not.toContain("Revoke");
	});

	it("renders switch and revoke controls for another account in this browser", () => {
		const html = renderToStaticMarkup(
			<DeviceSessionRow
				deviceSession={{
					session: {
						id: "session_2",
						token: "token_2",
						expiresAt: new Date("2026-01-01T00:00:00Z"),
					},
					user: {
						id: "user_2",
						name: "Riley Other",
						email: "riley@example.com",
					},
				}}
				currentUserId="user_1"
				busy={false}
				onSetActive={() => undefined}
				onRevoke={() => undefined}
			/>,
		);

		expect(html).toContain("Riley Other");
		expect(html).toContain("riley@example.com");
		expect(html).toContain("Switch");
		expect(html).toContain("Revoke");
		expect(html).not.toContain("Current account");
	});
});
