import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
	value: T;
	label: ReactNode;
	icon?: ComponentType<{ className?: string }>;
}

/**
 * Flat underline-style selector. A quieter alternative to boxed tabs.
 * Tabs: options sit on a single hairline, the active one carries a brand
 * underline and full-strength text. Used for picking between a small set of
 * peer choices (e.g. 2FA verification methods).
 */
export function Segmented<T extends string>({
	value,
	onChange,
	options,
	"aria-label": ariaLabel,
	className,
}: {
	value: T;
	onChange: (value: T) => void;
	options: SegmentedOption<T>[];
	"aria-label"?: string;
	className?: string;
}) {
	return (
		<div
			role="tablist"
			aria-label={ariaLabel}
			className={cn("flex items-stretch border-b", className)}
		>
			{options.map((option) => {
				const active = option.value === value;
				const Icon = option.icon;
				return (
					<button
						key={option.value}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(option.value)}
						className={cn(
							"relative flex min-h-10 flex-1 items-center justify-center gap-1.5 px-2 pb-2.5 pt-1 text-sm font-medium transition-[scale,color] duration-150 ease-out outline-none active:scale-[0.96]",
							"focus-visible:text-foreground",
							active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
						)}
					>
						{Icon ? <Icon className="size-4" /> : null}
						{option.label}
						<span
							aria-hidden="true"
							className={cn(
								"absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand transition-opacity duration-150 ease-out",
								active ? "opacity-100" : "opacity-0",
							)}
						/>
					</button>
				);
			})}
		</div>
	);
}
