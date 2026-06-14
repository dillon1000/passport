import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

function systemTheme(): Theme {
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The theme already applied to <html> by the inline boot script. */
function currentTheme(): Theme {
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	root.classList.toggle("dark", theme === "dark");
	root.style.colorScheme = theme;
}

/**
 * Reads/sets the active theme. Persists an explicit choice to localStorage and
 * keeps following the OS until the user makes one.
 */
export function useTheme() {
	const [theme, setThemeState] = useState<Theme>(currentTheme);

	useEffect(() => {
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => {
			if (!localStorage.getItem(STORAGE_KEY)) {
				const next = systemTheme();
				setThemeState(next);
				applyTheme(next);
			}
		};
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, []);

	function setTheme(next: Theme) {
		localStorage.setItem(STORAGE_KEY, next);
		applyTheme(next);
		setThemeState(next);
	}

	return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
