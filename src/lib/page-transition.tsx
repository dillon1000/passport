import { useState, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router";

import {
	PageDirectionContext,
	resolvePageDirection,
	type PageDirection,
} from "@/lib/page-direction";

/**
 * Publishes the direction of the current navigation so the content well can
 * swipe in from the side the new page sits on. Mount it inside the router and
 * above the routes; pages rendered without it simply don't swipe.
 */
export function PageTransitionProvider({ children }: { children: ReactNode }) {
	const { pathname } = useLocation();
	const navigationType = useNavigationType();
	const [entry, setEntry] = useState(() => ({ pathname, direction: "none" as PageDirection }));

	// Derived from the location during render rather than in an effect: the
	// direction has to be on the element for its very first painted frame.
	if (entry.pathname !== pathname) {
		setEntry({
			pathname,
			direction: resolvePageDirection(entry.pathname, pathname, navigationType === "POP"),
		});
	}

	return <PageDirectionContext value={entry.direction}>{children}</PageDirectionContext>;
}
