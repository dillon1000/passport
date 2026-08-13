/**
 * Passport dialog composition backed by Kumo. These slots preserve the
 * application-level layout vocabulary while Kumo owns portal, focus, escape,
 * backdrop, and ARIA behavior.
 */
import * as React from "react";
import { X } from "@/lib/icons";
import { Dialog as KumoDialog, cn } from "@cloudflare/kumo";
import { Button } from "./button";

function Dialog(props: React.ComponentProps<typeof KumoDialog.Root>) {
	return <KumoDialog.Root {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof KumoDialog.Trigger>) {
	return <KumoDialog.Trigger {...props} />;
}

function DialogClose({ asChild = false, children, ...props }: React.ComponentProps<typeof KumoDialog.Close> & { asChild?: boolean }) {
	if (asChild && React.isValidElement(children)) {
		return <KumoDialog.Close {...props} render={children} />;
	}

	return <KumoDialog.Close {...props}>{children}</KumoDialog.Close>;
}

function DialogContent({ className, children, showCloseButton = true, ...props }: React.ComponentProps<typeof KumoDialog> & { showCloseButton?: boolean }) {
	return <KumoDialog className={cn("!z-[100] p-5", className)} {...props}>
		{children}
		{showCloseButton ? (
			<KumoDialog.Close render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3 !z-[1]" aria-label="Close dialog"><X className="size-4" /></Button>} />
		) : null}
	</KumoDialog>;
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

function DialogFooter({ className, showCloseButton = false, children, ...props }: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
	return (
		<div className={cn("-mx-5 -mb-5 mt-5 flex flex-col-reverse gap-2 border-t bg-muted/50 px-5 py-4 sm:flex-row sm:justify-end", className)} {...props}>
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
