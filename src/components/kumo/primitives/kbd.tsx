import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Visual keyboard-key hint. Inline, monospace, neutral. Use to advertise
 * shortcuts (e.g. ⌘↵ to submit) so the UI is discoverable for keyboard users.
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
	return (
		<kbd
			data-slot="kbd"
			className={cn(
				"inline-flex h-5 min-w-5 items-center justify-center rounded-[min(var(--radius-sm),6px)] border border-border bg-muted px-1.5 font-mono text-[0.6875rem] font-medium text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export { Kbd };
