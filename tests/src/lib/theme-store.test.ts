import { beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_STORAGE_KEY, applyTheme, resetThemeStoreForTests, useThemeStore } from "./theme-store";

function installDOMStubs() {
	const classes = new Set<string>();
	const storage = new Map<string, string>();
	const style = {
		colorScheme: "",
	};

	vi.stubGlobal("document", {
		documentElement: {
			classList: {
				contains: (name: string) => classes.has(name),
				toggle: (name: string, force?: boolean) => {
					const shouldHave = force ?? !classes.has(name);
					if (shouldHave) classes.add(name);
					else classes.delete(name);
					return shouldHave;
				},
			},
			style,
		},
	});
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => storage.set(key, value),
		removeItem: (key: string) => storage.delete(key),
	});
	vi.stubGlobal("window", {
		matchMedia: vi.fn(() => ({
			matches: false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	});

	return { classes, storage, style };
}

describe("applyTheme", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		resetThemeStoreForTests("light");
	});

	it("applies the dark class and color scheme", () => {
		const { classes, style } = installDOMStubs();

		applyTheme("dark");

		expect(classes.has("dark")).toBe(true);
		expect(style.colorScheme).toBe("dark");
	});
});

describe("useThemeStore", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		resetThemeStoreForTests("light");
	});

	it("persists explicit choices through Zustand actions", () => {
		const { classes, storage, style } = installDOMStubs();

		useThemeStore.getState().setTheme("dark");

		expect(useThemeStore.getState().theme).toBe("dark");
		expect(classes.has("dark")).toBe(true);
		expect(style.colorScheme).toBe("dark");
		expect(storage.get(THEME_STORAGE_KEY)).toBe("dark");
	});
});
