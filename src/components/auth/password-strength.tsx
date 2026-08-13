import { Check } from "@/lib/icons";

import { cn } from "@/lib/utils";

interface Requirement {
	label: string;
	test: (value: string) => boolean;
}

const REQUIREMENTS: Requirement[] = [
	{ label: "At least 8 characters", test: (value) => value.length >= 8 },
	{ label: "Upper & lowercase letters", test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) },
	{ label: "A number", test: (value) => /\d/.test(value) },
	{ label: "A symbol", test: (value) => /[^A-Za-z0-9]/.test(value) },
];

const LEVELS = [
	{ label: "Too weak", className: "bg-destructive" },
	{ label: "Weak", className: "bg-destructive" },
	{ label: "Fair", className: "bg-muted-foreground/50" },
	{ label: "Good", className: "bg-muted-foreground" },
	{ label: "Strong", className: "bg-foreground" },
] as const;

/** Number of satisfied requirements, 0–4, mapped onto the 5 strength levels. */
function score(value: string) {
	if (!value) return 0;
	const met = REQUIREMENTS.filter((requirement) => requirement.test(value)).length;
	// Long passwords get a nudge so a 20-char passphrase reads as strong.
	return Math.min(4, met + (value.length >= 16 ? 1 : 0));
}

/**
 * Live password feedback: a four-segment strength bar plus a requirements
 * checklist that ticks off as the value satisfies each rule. Renders nothing
 * until the user starts typing so empty forms stay quiet.
 */
export function PasswordStrength({ value }: { value: string }) {
	if (!value) return null;
	const level = score(value);
	const { label, className } = LEVELS[level];

	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-2">
				<div className="flex flex-1 gap-1">
					{[0, 1, 2, 3].map((index) => (
						<span
							key={index}
							className={cn(
								"h-1 flex-1 rounded-full transition-colors",
								index < Math.max(level, value ? 1 : 0) ? className : "bg-border",
							)}
						/>
					))}
				</div>
				<span className="w-16 text-right text-xs font-medium text-muted-foreground">{label}</span>
			</div>
			<ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
				{REQUIREMENTS.map((requirement) => {
					const met = requirement.test(value);
					return (
						<li
							key={requirement.label}
							className={cn(
								"flex items-center gap-1.5 text-xs transition-colors",
								met ? "text-foreground" : "text-muted-foreground",
							)}
						>
							<span
								className={cn(
									"grid size-3.5 shrink-0 place-items-center rounded-full border transition-colors",
									met ? "border-foreground bg-foreground text-background" : "border-border",
								)}
							>
								{met ? <Check className="size-2.5" strokeWidth={3} /> : null}
							</span>
							{requirement.label}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
