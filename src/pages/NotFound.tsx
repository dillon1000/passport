/**
 * Not-found page for unmatched frontend routes. Inputs are only the browser URL;
 * output is a neutral recovery screen that keeps unknown paths distinct from
 * sign-in failures. Keep links limited to stable public entry points so this
 * page works before a session exists.
 */
import { ArrowLeft, SearchX } from "@/lib/icons";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/kumo/primitives/button";
import { Card, CardContent, CardFooter } from "@/components/kumo/primitives/card";
import { useBrand } from "@/lib/brand-runtime";

export function NotFound() {
	const brand = useBrand();

	return (
		<AuthShell breadcrumb="Not found">
			<Card className="gap-0 py-0">
				<CardContent className="space-y-5 px-6 py-6">
					<div className="flex items-start gap-3">
						<span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-muted/40 text-muted-foreground">
							<SearchX className="size-5" aria-hidden="true" />
						</span>
						<div className="space-y-1">
							<h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
							<p className="text-sm text-muted-foreground">
								{brand.name} does not have a page at this address.
							</p>
						</div>
					</div>
				</CardContent>
				<CardFooter className="flex-col items-stretch gap-3 bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs text-muted-foreground">
						Check the URL, or return to a known Passport entry point.
					</p>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Button asChild variant="outline">
							<a href="/about">About {brand.name}</a>
						</Button>
						<Button asChild>
							<a href="/sign-in">
								<ArrowLeft className="size-4" aria-hidden="true" />
								Sign in
							</a>
						</Button>
					</div>
				</CardFooter>
			</Card>
		</AuthShell>
	);
}
