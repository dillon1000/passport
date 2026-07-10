import { describe, expect, it } from "vitest";

import { normalizeEmailChangeValue } from "./account";

describe("normalizeEmailChangeValue", () => {
	it("trims accidental surrounding whitespace from account email changes", () => {
		expect(normalizeEmailChangeValue("  user@example.com  ")).toBe("user@example.com");
	});
});
