import { createContext, use } from "react";

import { navRank } from "@/lib/nav";

export type PageDirection = "forward" | "backward" | "none";

export const PageDirectionContext = createContext<PageDirection>("none");

/** Direction of the current navigation; `none` for pages rendered without the provider. */
export function usePageDirection() {
	return use(PageDirectionContext);
}

/**
 * Pages that live in the tab strips compare their position there, so moving
 * right along the tabs always swipes left regardless of how you got there — a
 * back button that lands on an earlier tab still reads as going back. Anything
 * outside the strips falls back to the history action.
 */
export function resolvePageDirection(from: string, to: string, isPop: boolean): PageDirection {
	if (from === to) return "none";

	const fromRank = navRank(from);
	const toRank = navRank(to);
	if (fromRank && toRank) {
		const step = fromRank[0] === toRank[0] ? toRank[1] - fromRank[1] : toRank[0] - fromRank[0];
		if (step === 0) return "none";
		return step > 0 ? "forward" : "backward";
	}

	return isPop ? "backward" : "forward";
}
