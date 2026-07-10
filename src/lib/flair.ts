import { useSyncExternalStore } from "react";

/**
 * Account-flair display preference. `"rotate"` cross-fades through every field;
 * the other values pin the flair to a single piece of text.
 */
export type FlairMode = "rotate" | "name" | "email" | "datetime" | "greeting" | "quip";

const STORAGE_KEY = "profile-flair";
const EVENT = "profile-flair-change";

type FlairStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

/** Static choices offered in Settings, in display order. */
export const FLAIR_STATIC_OPTIONS: { value: Exclude<FlairMode, "rotate">; label: string }[] = [
	{ value: "name", label: "Name" },
	{ value: "email", label: "Email" },
	{ value: "datetime", label: "Date & time" },
	{ value: "greeting", label: "Greeting" },
	{ value: "quip", label: "Quip" },
];

export function normalizeFlairMode(value: string | null): FlairMode {
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

export function readStoredFlairMode(storage: Pick<FlairStorage, "getItem"> | undefined): FlairMode {
	if (!storage) return "rotate";
	try {
		return normalizeFlairMode(storage.getItem(STORAGE_KEY));
	} catch {
		return "rotate";
	}
}

export function writeStoredFlairMode(
	next: FlairMode,
	storage: Pick<FlairStorage, "removeItem" | "setItem"> | undefined,
) {
	if (!storage) return;
	try {
		if (next === "rotate") {
			storage.removeItem(STORAGE_KEY);
		} else {
			storage.setItem(STORAGE_KEY, next);
		}
	} catch {
		// Storage can be disabled by browser policy; keep the in-memory update
		// notification path alive so the current tab still reflects the click.
	}
}

function storage() {
	return typeof localStorage === "undefined" ? undefined : localStorage;
}

function read(): FlairMode {
	return readStoredFlairMode(storage());
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
		writeStoredFlairMode(next, storage());
		window.dispatchEvent(new Event(EVENT));
	}

	return { mode, setMode };
}
