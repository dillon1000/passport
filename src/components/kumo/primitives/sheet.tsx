/**
 * Passport's responsive drawer composition uses Kumo's Drawer root so nested
 * sheets retain focus and stack correctly. Desktop sheets enter from the right;
 * mobile sheets enter from the bottom. The width variable keeps caller sizing.
 */
import * as React from "react";
import { X } from "@/lib/icons";
import { Dialog as KumoDialog, cn } from "@cloudflare/kumo";
import { Drawer } from "@cloudflare/kumo/primitives/drawer";
import { Button } from "./button";

function Sheet(props: React.ComponentProps<typeof Drawer.Root>) {
	return <Drawer.Root {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof KumoDialog.Trigger>) {
	return <KumoDialog.Trigger {...props} />;
}

function SheetClose({ asChild = false, children, ...props }: React.ComponentProps<typeof KumoDialog.Close> & { asChild?: boolean }) {
	if (asChild && React.isValidElement(children)) {
		return <KumoDialog.Close {...props} render={children} />;
	}
	return <KumoDialog.Close {...props}>{children}</KumoDialog.Close>;
}

function SheetContent({ className, children, pushed = false, showCloseButton = true, style, ...props }: React.ComponentProps<typeof KumoDialog> & { pushed?: boolean; showCloseButton?: boolean }) {
	return <KumoDialog data-slot="sheet-content" data-pushed={pushed || undefined} size="lg" style={{ transitionProperty: "transform, translate, scale", transitionDuration: "0.42s", transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)", ...style }} className={cn("!fixed !z-[100] !bottom-2 !left-2 !right-2 !flex !h-[min(80dvh,44rem)] !w-[calc(100vw-1rem)] !max-w-none !translate-x-0 !translate-y-0 !flex-col !overflow-hidden !p-0 data-[starting-style]:!scale-100 data-[starting-style]:!opacity-100 data-[starting-style]:!translate-y-[calc(100%+1rem)] data-[ending-style]:!scale-100 data-[ending-style]:!opacity-100 data-[ending-style]:!translate-y-[calc(100%+1rem)] sm:!inset-y-3 sm:!left-auto sm:!right-3 sm:!h-[calc(100dvh-1.5rem)] sm:!w-[min(var(--sheet-width,32rem),calc(100vw-1.5rem))] sm:data-[starting-style]:!translate-x-[calc(100%+1rem)] sm:data-[starting-style]:!translate-y-0 sm:data-[ending-style]:!translate-x-[calc(100%+1rem)] sm:data-[ending-style]:!translate-y-0", pushed && "sm:!translate-x-[-1.75rem] sm:!scale-[0.965]", className)} {...props}>
		{children}
		{showCloseButton ? (
			<KumoDialog.Close render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3 !z-[1]" aria-label="Close sheet"><X className="size-4" /></Button>} />
		) : null}
	</KumoDialog>;
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex flex-col gap-1.5 border-b px-5 py-4 pr-12", className)} {...props} />;
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex-1 overflow-y-auto px-5 py-5", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex flex-col-reverse gap-2 border-t bg-muted/40 px-5 py-3.5 sm:flex-row sm:justify-end", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof KumoDialog.Title>) {
	return <KumoDialog.Title className={cn("text-base font-medium", className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof KumoDialog.Description>) {
	return <KumoDialog.Description className={cn("text-sm text-kumo-subtle", className)} {...props} />;
}

export { Sheet, SheetBody, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger };
