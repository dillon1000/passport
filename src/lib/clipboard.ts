/**
 * Clipboard helper for dashboard copy buttons. Inputs are the text to copy and
 * the browser Clipboard API; output is a small status object the caller can
 * surface through its existing StatusBanner. The optional clipboard parameter
 * keeps the behavior unit-testable without relying on a browser environment.
 */
type ClipboardWriter = {
	writeText(value: string): Promise<void>;
};

export type ClipboardCopyResult =
	| { ok: true }
	| { ok: false; message: string };

export async function copyTextToClipboard(
	value: string,
	clipboard: ClipboardWriter | undefined = globalThis.navigator?.clipboard,
): Promise<ClipboardCopyResult> {
	if (!clipboard) {
		return {
			ok: false,
			message: "Clipboard is not available in this browser.",
		};
	}

	try {
		await clipboard.writeText(value);
		return { ok: true };
	} catch {
		return {
			ok: false,
			message: "Could not copy to clipboard.",
		};
	}
}
