import { afterEach, describe, expect, it, vi } from "vitest";

import { withDirectionalViewTransition } from "./view-transition";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
	Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
	Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

describe("withDirectionalViewTransition", () => {
	it("publishes direction until the transition finishes", async () => {
		let finishTransition = () => undefined;
		const finished = new Promise<void>((resolve) => {
			finishTransition = resolve;
		});
		const dataset: DOMStringMap = {};
		const update = vi.fn();
		const startViewTransition = vi.fn((callback: () => void) => {
			callback();
			return { finished };
		});
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: { documentElement: { dataset }, startViewTransition },
		});
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { matchMedia: () => ({ matches: false }) },
		});

		withDirectionalViewTransition(update, "forward");

		expect(update).toHaveBeenCalledOnce();
		expect(dataset.viewTransitionDirection).toBe("forward");

		finishTransition();
		await finished;
		await Promise.resolve();
		expect(dataset.viewTransitionDirection).toBeUndefined();
	});

	it("updates immediately when reduced motion is enabled", () => {
		const dataset: DOMStringMap = {};
		const update = vi.fn();
		const startViewTransition = vi.fn();
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: { documentElement: { dataset }, startViewTransition },
		});
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { matchMedia: () => ({ matches: true }) },
		});
		Object.defineProperty(globalThis, "matchMedia", {
			configurable: true,
			value: () => ({ matches: true }),
		});

		withDirectionalViewTransition(update, "backward");

		expect(update).toHaveBeenCalledOnce();
		expect(startViewTransition).not.toHaveBeenCalled();
		expect(dataset.viewTransitionDirection).toBeUndefined();
	});
});
