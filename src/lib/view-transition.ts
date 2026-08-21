/**
 * Imperative view-transition helper. React 19 stable does not ship the
 * `<ViewTransition>` component, so state swaps call the browser API directly.
 * Directional swaps expose their direction on the document while snapshots
 * animate. Both paths degrade to an immediate update when motion is reduced or
 * the browser does not support the API.
 */
type StartViewTransition = (callback: () => void) => unknown;
export type ViewTransitionDirection = "forward" | "backward";

const prefersReducedMotion = () =>
	typeof window !== "undefined" &&
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function withViewTransition(update: () => void): void {
	startViewTransition(update);
}

/**
 * Runs a state update with direction metadata for named view-transition CSS.
 * The metadata exists only for the active transition and is removed on finish
 * or failure, so later transitions cannot inherit a stale direction.
 */
export function withDirectionalViewTransition(
	update: () => void,
	direction: ViewTransitionDirection,
): void {
	startViewTransition(update, direction);
}

function startViewTransition(
	update: () => void,
	direction?: ViewTransitionDirection,
): void {
	const doc = document as Document & { startViewTransition?: StartViewTransition };
	if (typeof doc.startViewTransition !== "function" || prefersReducedMotion()) {
		update();
		return;
	}
	if (direction) document.documentElement.dataset.viewTransitionDirection = direction;

	function clearDirection() {
		if (direction) delete document.documentElement.dataset.viewTransitionDirection;
	}

	try {
		const transition = doc.startViewTransition(update) as { finished?: Promise<unknown> };
		if (transition.finished) {
			void transition.finished.catch(() => undefined).finally(clearDirection);
		} else {
			queueMicrotask(clearDirection);
		}
	} catch {
		clearDirection();
		update();
	}
}
