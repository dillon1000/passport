import type { ReactNode } from "react";

/** Compact status summary shown on a settings card before opening its drawer. */
export function SummaryRow({
	icon,
	title,
	subtitle,
}: {
	icon: ReactNode;
	title: ReactNode;
	subtitle: ReactNode;
}) {
	return (
		<div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3.5 py-3">
			<span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
				{icon}
			</span>
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium">{title}</div>
				<p className="truncate text-xs text-muted-foreground">{subtitle}</p>
			</div>
		</div>
	);
}
