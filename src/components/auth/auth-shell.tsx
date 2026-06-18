import type { ReactNode } from "react";

import { Wordmark } from "@/components/auth/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { useBrand } from "@/lib/brand-runtime";
import { cn } from "@/lib/utils";

/**
 * Shared page frame: a slim sticky top bar (brand + optional breadcrumb on the
 * left, actions + theme toggle on the right), a centered content well, and a
 * quiet operator footer. Pages compose their content into `children`.
 */
export function AuthShell({
	children,
	width = "sm",
	breadcrumb,
	actions,
	nav,
}: {
	children: ReactNode;
	/** Content well width. `sm` for forms, `md` for denser forms, `lg`/`xl` for the dashboard. */
	width?: "sm" | "md" | "lg" | "xl";
	/** Trailing nav segment, e.g. the current page name. */
	breadcrumb?: ReactNode;
	/** Right-aligned controls rendered before the theme toggle. */
	actions?: ReactNode;
	/** Secondary page-tab strip rendered as a second header row. */
	nav?: ReactNode;
}) {
	const brand = useBrand();

	return (
		<div className="flex min-h-svh flex-col">
			<header className="sticky top-0 z-10 bg-background/75 backdrop-blur-md [view-transition-name:site-header]">
				<div
					className={cn(
						"mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4 sm:px-6",
						!nav && "border-b",
					)}
				>
					<Wordmark className="h-6" />
					{breadcrumb ? (
						<>
							<Slash />
							<span className="text-sm font-medium">{breadcrumb}</span>
						</>
					) : null}
					<div className="ml-auto flex items-center gap-1">{actions}</div>
				</div>
				{nav ? (
					<div className="border-b">
						<div className="mx-auto w-full max-w-5xl px-3 sm:px-5">{nav}</div>
					</div>
				) : null}
			</header>

			<main
				id="main"
				className="flex flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-16"
			>
				<div
					className={cn(
						"w-full",
						width === "xl" && "max-w-4xl",
						width === "lg" && "max-w-2xl",
						width === "md" && "max-w-lg",
						width === "sm" && "max-w-[400px]",
					)}
				>
					{children}
				</div>
			</main>

			<footer className="border-t [view-transition-name:site-footer]">
				<div className="relative mx-auto flex w-full max-w-5xl items-center justify-center gap-3 px-4 py-4 font-mono text-xs text-muted-foreground/70 sm:px-6">
					{brand.capabilities.map((capability, index) => (
						<span key={capability} className="flex items-center gap-3">
							{index > 0 ? (
								<span aria-hidden="true" className="text-border">
									·
								</span>
							) : null}
							{capability}
						</span>
					))}
					<div className="absolute right-2 top-1/2 -translate-y-1/2 sm:right-4">
						<ThemeToggle />
					</div>
				</div>
			</footer>
		</div>
	);
}

/** Vercel-style angled breadcrumb separator. */
function Slash() {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			className="shrink-0 text-border"
		>
			<path d="M16.88 3.55 7.12 20.45" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
		</svg>
	);
}
