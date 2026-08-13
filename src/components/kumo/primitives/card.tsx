/**
 * Passport card slots backed by Kumo's LayerCard surface. The slots preserve
 * the application's composition API while Kumo owns the actual card surface.
 */
import * as React from "react";

import { LayerCard, cn } from "@cloudflare/kumo";

const Card = React.forwardRef<
	HTMLDivElement,
	React.ComponentPropsWithoutRef<typeof LayerCard>
>(({ className, ...props }, ref) => (
	<LayerCard ref={ref} className={cn("gap-0 p-0", className)} {...props} />
));
Card.displayName = "Card";

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("px-5 pt-5", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("font-medium text-kumo-default", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("text-sm text-kumo-subtle", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("px-5 py-5", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex px-5 py-4", className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("absolute top-5 right-5", className)} {...props} />;
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
