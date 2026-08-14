import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SUPPORTED_OAUTH_SCOPES } from "@/lib/oauth-scopes";

import { ScopeBuilder } from "./scope-builder";

describe("ScopeBuilder", () => {
	it("renders every supported scope as a checkbox", () => {
		const html = renderToStaticMarkup(
			<ScopeBuilder value={["openid", "email"]} onValueChange={() => undefined} />,
		);

		expect(html.match(/role="checkbox"/g)).toHaveLength(SUPPORTED_OAUTH_SCOPES.length);
		for (const scope of SUPPORTED_OAUTH_SCOPES) {
			expect(html).toContain(scope);
		}
	});

	it("reports and checks the selected scopes", () => {
		const html = renderToStaticMarkup(
			<ScopeBuilder value={["openid", "email"]} onValueChange={() => undefined} />,
		);

		expect(html).toContain("2 selected");
		expect(html.match(/aria-checked="true"/g)).toHaveLength(2);
	});

	it("offers to copy only the selected scopes", () => {
		const html = renderToStaticMarkup(
			<ScopeBuilder value={["openid"]} onValueChange={() => undefined} />,
		);

		expect(html).toContain("Copy selected scopes");
		expect(html).toContain('type="button"');
	});

	it("disables copying when no scopes are selected", () => {
		const html = renderToStaticMarkup(
			<ScopeBuilder value={[]} onValueChange={() => undefined} />,
		);

		expect(html).toContain("Copy selected scopes");
		expect(html).toContain("disabled");
	});
});
