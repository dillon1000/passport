import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sheetStyles = readFileSync(
	new URL("../../../../src/index.css", import.meta.url),
	"utf8",
);

describe("Sheet motion", () => {
	it("uses the transition attributes emitted by Base UI", () => {
		expect(sheetStyles).toContain('[data-slot="sheet-content"][data-starting-style]');
		expect(sheetStyles).toContain('[data-slot="sheet-content"][data-ending-style]');
		expect(sheetStyles).not.toContain('[data-slot="sheet-content"][data-state="open"]');
	});
});
