import { useSyncExternalStore } from "react";

/**
 * Account-flair display preference. `"rotate"` cross-fades through every field;
 * the other values pin the flair to a single piece of text.
 */
export type FlairMode = "rotate" | "name" | "email" | "datetime" | "greeting" | "quip";

const STORAGE_KEY = "profile-flair";
const EVENT = "profile-flair-change";

/** Static choices offered in Settings, in display order. */
export const FLAIR_STATIC_OPTIONS: { value: Exclude<FlairMode, "rotate">; label: string }[] = [
	{ value: "name", label: "Name" },
	{ value: "email", label: "Email" },
	{ value: "datetime", label: "Date & time" },
	{ value: "greeting", label: "Greeting" },
	{ value: "quip", label: "Quip" },
];

function read(): FlairMode {
	if (typeof localStorage === "undefined") return "rotate";
	const value = localStorage.getItem(STORAGE_KEY);
	if (
		value === "name" ||
		value === "email" ||
		value === "datetime" ||
		value === "greeting" ||
		value === "quip"
	) {
		return value;
	}
	return "rotate";
}

function subscribe(callback: () => void) {
	window.addEventListener(EVENT, callback);
	window.addEventListener("storage", callback);
	return () => {
		window.removeEventListener(EVENT, callback);
		window.removeEventListener("storage", callback);
	};
}

/**
 * Reads/sets the flair display mode. Persists to localStorage and notifies every
 * subscriber in the tab so the header flair and the Settings control stay in sync.
 */
export function useFlairMode() {
	const mode = useSyncExternalStore(subscribe, read, () => "rotate" as FlairMode);

	function setMode(next: FlairMode) {
		if (next === "rotate") {
			localStorage.removeItem(STORAGE_KEY);
		} else {
			localStorage.setItem(STORAGE_KEY, next);
		}
		window.dispatchEvent(new Event(EVENT));
	}

	return { mode, setMode };
}
