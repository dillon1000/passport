/**
 * React hook facade for the app-wide Zustand theme store. It subscribes to OS
 * color-scheme changes while no explicit localStorage theme exists, and exposes
 * the stable API used by `ThemeToggle`.
 */
import { useEffect } from "react";

export type { Theme } from "@/lib/theme-store";

import { THEME_STORAGE_KEY, useThemeStore } from "@/lib/theme-store";

/**
 * Reads/sets the active theme. Persists an explicit choice to localStorage and
 * keeps following the OS until the user makes one.
 */
export function useTheme() {
	const theme = useThemeStore((state) => state.theme);
	const setTheme = useThemeStore((state) => state.setTheme);
	const syncSystemTheme = useThemeStore((state) => state.syncSystemTheme);
	const toggle = useThemeStore((state) => state.toggle);

	useEffect(() => {
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => {
			if (!localStorage.getItem(THEME_STORAGE_KEY)) {
				syncSystemTheme();
			}
		};
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [syncSystemTheme]);

	return { theme, setTheme, toggle };
}
