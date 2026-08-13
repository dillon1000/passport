/**
 * Passport's right-side drawer composition backed by Kumo Dialog. Kumo owns
 * the modal lifecycle while the content class intentionally places the panel
 * at the viewport edge for the dashboard's drawer workflow.
 */
import * as React from "react";
import { Dialog as KumoDialog, cn } from "@cloudflare/kumo";

function Sheet(props: React.ComponentProps<typeof KumoDialog.Root>) {
	return <KumoDialog.Root {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof KumoDialog.Trigger>) {
	return <KumoDialog.Trigger {...props} />;
}

function SheetClose({ asChild = false, children, ...props }: React.ComponentProps<typeof KumoDialog.Close> & { asChild?: boolean }) {
	if (asChild && React.isValidElement(children)) {
		return <KumoDialog.Close {...props} render={(closeProps) => React.cloneElement(children, closeProps)} />;
	}
	return <KumoDialog.Close {...props}>{children}</KumoDialog.Close>;
}

function SheetContent({ className, children, pushed: _pushed, showCloseButton: _showCloseButton, ...props }: React.ComponentProps<typeof KumoDialog> & { pushed?: boolean; showCloseButton?: boolean }) {
	return <KumoDialog size="lg" className={cn("!fixed !inset-y-2 !right-2 !left-auto !h-[calc(100dvh-1rem)] !w-[calc(100vw-1rem)] !max-w-md !translate-x-0 !translate-y-0 !overflow-hidden !p-0 sm:!inset-y-3 sm:!right-3 sm:!h-[calc(100dvh-1.5rem)]", className)} {...props}>{children}</KumoDialog>;
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex flex-col gap-1.5 border-b px-5 py-4", className)} {...props} />;
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex-1 overflow-y-auto px-5 py-5", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex flex-col-reverse gap-2 border-t px-5 py-3.5 sm:flex-row sm:justify-end", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof KumoDialog.Title>) {
	return <KumoDialog.Title className={cn("text-base font-medium", className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof KumoDialog.Description>) {
	return <KumoDialog.Description className={cn("text-sm text-kumo-subtle", className)} {...props} />;
}

export { Sheet, SheetBody, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger };
