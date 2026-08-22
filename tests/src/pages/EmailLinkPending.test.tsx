import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmailLinkPending } from "./EmailLinkPending";

const actions = {
	onResend: () => undefined,
	onBack: () => undefined,
};

describe("EmailLinkPending", () => {
	it("renders password recovery as a dedicated waiting interstitial", () => {
		const html = renderToStaticMarkup(
			<EmailLinkPending
				kind="password-reset"
				email="person@example.com"
				loading={false}
				status={null}
				{...actions}
			/>,
		);

		expect(html).toContain("Check your email");
		expect(html).toContain("Waiting for your reset link");
		expect(html).toContain("Resend reset link");
		expect(html).toContain("person@example.com");
	});

	it("keeps magic-link-specific actions on the shared interstitial", () => {
		const html = renderToStaticMarkup(
			<EmailLinkPending
				kind="magic-link"
				email="person@example.com"
				loading={false}
				status={null}
				{...actions}
			/>,
		);

		expect(html).toContain("Waiting for your magic link");
		expect(html).toContain("Use another sign-in method");
	});
});
