import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sheetSource = readFileSync(
	new URL("../../../../src/components/kumo/primitives/sheet.tsx", import.meta.url),
	"utf8",
);

describe("Sheet motion", () => {
	it("keeps the established directional entrance and exit motion", () => {
		expect(sheetSource).toContain("data-[starting-style]:!translate-y-[calc(100%+1rem)]");
		expect(sheetSource).toContain("sm:data-[starting-style]:!translate-x-[calc(100%+1rem)]");
		expect(sheetSource).toContain("data-[ending-style]:!translate-y-[calc(100%+1rem)]");
	});

	it("clears Kumo's centered-dialog translation at rest", () => {
		expect(sheetSource).toContain("!translate-x-0 !translate-y-0");
	});
});
