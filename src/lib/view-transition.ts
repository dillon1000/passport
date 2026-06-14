/**
 * Imperative view-transition helper. React 19 stable does not ship the
 * `<ViewTransition>` component, so for the few state swaps that benefit from a
 * cross-fade we call the browser API directly, degrading gracefully where it
 * (or the user's motion preference) is unavailable.
 */
type StartViewTransition = (callback: () => void) => unknown;

const prefersReducedMotion = () =>
	typeof window !== "undefined" &&
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function withViewTransition(update: () => void): void {
	const doc = document as Document & { startViewTransition?: StartViewTransition };
	if (typeof doc.startViewTransition !== "function" || prefersReducedMotion()) {
		update();
		return;
	}
	try {
		const transition = doc.startViewTransition(update) as { finished?: Promise<unknown> };
		transition.finished?.catch(() => {
			// A transition can be aborted by fast navigation; the state update already ran.
		});
	} catch {
		update();
	}
}
