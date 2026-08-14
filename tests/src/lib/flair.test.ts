import { describe, expect, it, vi } from "vitest";

import { normalizeFlairMode, readStoredFlairMode, writeStoredFlairMode } from "./flair";

describe("flair storage helpers", () => {
	it("normalizes unsupported flair values back to rotate", () => {
		expect(normalizeFlairMode("email")).toBe("email");
		expect(normalizeFlairMode("profile")).toBe("rotate");
		expect(normalizeFlairMode(null)).toBe("rotate");
	});

	it("falls back to rotate when storage cannot be read", () => {
		const storage = {
			getItem: vi.fn(() => {
				throw new Error("blocked");
			}),
		};

		expect(readStoredFlairMode(storage)).toBe("rotate");
	});

	it("does not throw when storage cannot be written", () => {
		const storage = {
			removeItem: vi.fn(() => {
				throw new Error("blocked");
			}),
			setItem: vi.fn(() => {
				throw new Error("blocked");
			}),
		};

		expect(() => writeStoredFlairMode("rotate", storage)).not.toThrow();
		expect(() => writeStoredFlairMode("quip", storage)).not.toThrow();
	});
});
