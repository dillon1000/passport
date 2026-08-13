/**
 * Passport dialog composition backed by Kumo. These slots preserve the
 * application-level layout vocabulary while Kumo owns portal, focus, escape,
 * backdrop, and ARIA behavior.
 */
import * as React from "react";
import { Dialog as KumoDialog, cn } from "@cloudflare/kumo";

function Dialog(props: React.ComponentProps<typeof KumoDialog.Root>) {
	return <KumoDialog.Root {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof KumoDialog.Trigger>) {
	return <KumoDialog.Trigger {...props} />;
}

function DialogClose({ asChild = false, children, ...props }: React.ComponentProps<typeof KumoDialog.Close> & { asChild?: boolean }) {
	if (asChild && React.isValidElement(children)) {
		return <KumoDialog.Close {...props} render={(closeProps) => React.cloneElement(children, closeProps)} />;
	}

	return <KumoDialog.Close {...props}>{children}</KumoDialog.Close>;
}

function DialogContent({ className, children, showCloseButton: _showCloseButton, ...props }: React.ComponentProps<typeof KumoDialog> & { showCloseButton?: boolean }) {
	return <KumoDialog className={cn("p-5", className)} {...props}>{children}</KumoDialog>;
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

function DialogFooter({ className, showCloseButton = false, children, ...props }: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
	return (
		<div className={cn("mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props}>
			{children}
			{showCloseButton ? <DialogClose>Close</DialogClose> : null}
		</div>
	);
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof KumoDialog.Title>) {
	return <KumoDialog.Title className={cn("text-base font-medium", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof KumoDialog.Description>) {
	return <KumoDialog.Description className={cn("text-sm text-kumo-subtle", className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger };
