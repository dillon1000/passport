/**
 * Passport exposes Kumo ClipboardText for identifiers and secrets. Kumo owns
 * copy feedback and fallback behavior while this wrapper keeps the active
 * Passport form surface and compact icon geometry.
 */
import * as React from "react";
import { ClipboardText as KumoClipboardText, cn } from "@cloudflare/kumo";

function ClipboardText({ className, ...props }: React.ComponentProps<typeof KumoClipboardText>) {
	return <KumoClipboardText
		className={cn(
			"min-w-0 flex-1 rounded-lg border border-input bg-muted/40 px-3 py-2 text-xs text-foreground [&_button]:!size-7 [&_button]:!rounded-md [&_button_svg]:!size-4",
			className,
		)}
		{...props}
	/>;
}

export { ClipboardText };
