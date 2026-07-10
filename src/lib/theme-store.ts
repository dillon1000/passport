/**
 * Zustand store for app-wide theme state. Inputs are the boot-time `<html>`
 * class, localStorage, and the OS color-scheme media query; outputs are the
 * store's current theme plus DOM/localStorage updates when the user chooses a
 * theme. Keep the storage key stable so existing user preferences survive app
 * upgrades.
 */
import { create } from "zustand";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

type ThemeStore = {
	theme: Theme;
	setTheme: (next: Theme) => void;
	syncSystemTheme: () => void;
	toggle: () => void;
};

function hasDOM() {
	return typeof document !== "undefined";
}

function hasLocalStorage() {
	return typeof localStorage !== "undefined";
}

export function systemTheme(): Theme {
	if (typeof window === "undefined") return "light";
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function currentTheme(): Theme {
	if (!hasDOM()) return "light";
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
	if (!hasDOM()) return;
	const root = document.documentElement;
	root.classList.toggle("dark", theme === "dark");
	root.style.colorScheme = theme;
}

function persistTheme(theme: Theme) {
	if (!hasLocalStorage()) return;
	localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function hasExplicitTheme() {
	return hasLocalStorage() && Boolean(localStorage.getItem(THEME_STORAGE_KEY));
}

export const useThemeStore = create<ThemeStore>()((set, get) => ({
	theme: currentTheme(),
	setTheme(next) {
		persistTheme(next);
		applyTheme(next);
		set({ theme: next });
	},
	syncSystemTheme() {
		if (hasExplicitTheme()) return;
		const next = systemTheme();
		applyTheme(next);
		set({ theme: next });
	},
	toggle() {
		const next = get().theme === "dark" ? "light" : "dark";
		get().setTheme(next);
	},
}));

export function resetThemeStoreForTests(theme: Theme = "light") {
	useThemeStore.setState({ theme });
}
