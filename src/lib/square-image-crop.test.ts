import { describe, expect, it } from "vitest";

import { constrainSquareCropOffset, squareCropGeometry } from "./square-image-crop";

describe("squareCropGeometry", () => {
	it("shows a wide image in full at the initial zoom", () => {
		expect(squareCropGeometry(800, 400, 320, 1)).toEqual({
			drawWidth: 320,
			drawHeight: 160,
			maxOffsetX: 0,
			maxOffsetY: 80,
		});
	});

	it("enables panning after zooming beyond the square", () => {
		expect(squareCropGeometry(800, 400, 320, 2)).toEqual({
			drawWidth: 640,
			drawHeight: 320,
			maxOffsetX: 160,
			maxOffsetY: 0,
		});
	});

	it("constrains image offsets to the visible crop area", () => {
		expect(constrainSquareCropOffset(220, 160)).toBe(160);
		expect(constrainSquareCropOffset(-220, 160)).toBe(-160);
		expect(constrainSquareCropOffset(40, 160)).toBe(40);
	});
});
