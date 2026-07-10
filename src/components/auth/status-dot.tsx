import { cn } from "@/lib/utils";

export type DotTone = "active" | "warn" | "danger" | "idle";

const TONES: Record<DotTone, string> = {
	active: "bg-success",
	warn: "bg-muted-foreground",
	danger: "bg-destructive",
	idle: "bg-muted-foreground/40",
};

/**
 * Small status dot with a soft halo. Communicates live/ok/warn/off state at a
 * glance next to a label, in the neutral palette the rest of the UI uses.
 */
export function StatusDot({ tone, className }: { tone: DotTone; className?: string }) {
	return (
		<span className={cn("relative grid size-2.5 place-items-center", className)} aria-hidden="true">
			<span className={cn("absolute size-2.5 rounded-full opacity-30", TONES[tone])} />
			<span className={cn("size-1.5 rounded-full", TONES[tone])} />
		</span>
	);
}
