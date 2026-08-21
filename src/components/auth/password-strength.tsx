/**
 * Advisory password-strength feedback for account creation. The password and
 * optional user inputs are evaluated locally with zxcvbn; no value leaves the
 * browser. The fixed-height output prevents the form controls from moving.
 */
import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as common from "@zxcvbn-ts/language-common";
import * as english from "@zxcvbn-ts/language-en";

import { cn } from "@/lib/utils";

const zxcvbn = new ZxcvbnFactory({
	dictionary: { ...common.dictionary, ...english.dictionary },
	graphs: common.adjacencyGraphs,
	translations: english.translations,
});

const LEVELS = [
	{ label: "Too weak", className: "bg-destructive" },
	{ label: "Weak", className: "bg-destructive" },
	{ label: "Fair", className: "bg-muted-foreground/50" },
	{ label: "Good", className: "bg-muted-foreground" },
	{ label: "Strong", className: "bg-foreground" },
] as const;

export function PasswordStrength({
	value,
	userInputs = [],
}: {
	value: string;
	userInputs?: string[];
}) {
	const level = value ? zxcvbn.check(value, userInputs.filter(Boolean)).score : null;
	const feedback = level === null ? "Not rated" : LEVELS[level].label;

	return (
		<div className="min-h-16 space-y-2" aria-live="polite">
			<p className="text-xs text-muted-foreground">
				Use at least 8 characters. Longer passwords and passphrases are stronger.
			</p>
			<div className="flex items-center gap-2">
				<div className="flex flex-1 gap-1" aria-hidden="true">
					{[0, 1, 2, 3].map((index) => (
						<span
							key={index}
							className={cn(
								"h-1 flex-1 rounded-full transition-colors",
								level !== null && index < Math.max(level, 1)
									? LEVELS[level].className
									: "bg-border",
							)}
						/>
					))}
				</div>
				<span className="w-16 text-right text-xs font-medium text-muted-foreground">
					{feedback}
				</span>
			</div>
		</div>
	);
}
