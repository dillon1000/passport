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
			"!h-9 min-w-0 flex-1 !rounded-lg !border !border-input !bg-muted/40 !p-0 !text-xs !text-foreground !shadow-none [&>span]:!px-3 [&_button]:!size-8 [&_button]:!min-w-8 [&_button]:!rounded-l-none [&_button]:!rounded-r-[calc(var(--radius)-2px)] [&_button]:!border-l [&_button]:!border-input [&_button]:!px-0 [&_button]:!shadow-none [&_button_svg]:!size-4",
			className,
		)}
		{...props}
	/>;
}

export { ClipboardText };
