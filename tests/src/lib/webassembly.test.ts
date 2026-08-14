import { afterEach, describe, expect, it, vi } from "vitest";

import { isWebAssemblyAvailable } from "./webassembly";

describe("isWebAssemblyAvailable", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns false when the browser disables WebAssembly", () => {
		vi.stubGlobal("WebAssembly", undefined);

		expect(isWebAssemblyAvailable()).toBe(false);
	});

	it("returns true when the browser exposes WebAssembly", () => {
		vi.stubGlobal("WebAssembly", {});

		expect(isWebAssemblyAvailable()).toBe(true);
	});
});
