import type { ReactNode } from "react";

import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Vercel-style settings card: a titled section with an optional muted footer
 * bar carrying a hint on the left and an action on the right. Compose the body
 * as children.
 */
export function SettingsCard({
	title,
	description,
	children,
	footer,
	className,
}: {
	title: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
	footer?: ReactNode;
	className?: string;
}) {
	return (
		<Card className={cn("gap-0 py-0", className)}>
			<CardHeader className={cn("px-5 pt-5", children ? "pb-0" : "pb-5")}>
				<CardTitle className="text-[0.9375rem] tracking-tight">{title}</CardTitle>
				{description ? (
					<CardDescription className="mt-1 leading-relaxed">{description}</CardDescription>
				) : null}
			</CardHeader>
			{children ? <CardContent className="px-5 pt-4 pb-5">{children}</CardContent> : null}
			{footer ? (
				<CardFooter className="justify-between gap-3 border-t bg-muted/40 px-5 py-3.5 text-sm text-muted-foreground">
					{footer}
				</CardFooter>
			) : null}
		</Card>
	);
}

/** Convenience layout for a footer hint + trailing action. */
export function SettingsCardFooter({
	hint,
	children,
}: {
	hint?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<>
			<span className="text-muted-foreground">{hint}</span>
			{children ? <span className="shrink-0">{children}</span> : null}
		</>
	);
}
