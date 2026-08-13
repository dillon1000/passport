/**
 * App-owned Better Auth error page. Better Auth sends users here from
 * `onAPIError.errorURL`; the page reads the query string, shows the sanitized
 * failure details, and gives users a clear way back into the sign-in flow.
 */
import { ArrowLeft, TriangleAlert } from "@/lib/icons";
import { Banner } from "@cloudflare/kumo";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/kumo/primitives/button";
import { Card, CardContent, CardFooter } from "@/components/kumo/primitives/card";
import { authErrorDetails } from "@/lib/auth-error";
import { useBrand } from "@/lib/brand-runtime";

export function AuthError() {
	const brand = useBrand();
	const details = authErrorDetails(new URLSearchParams(window.location.search));

	return (
		<AuthShell breadcrumb="Error">
			<Card className="gap-0 py-0">
				<CardContent className="space-y-5 px-6 py-6">
					<div className="flex items-start gap-3">
						<span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-destructive/10 text-destructive">
							<TriangleAlert className="size-5" aria-hidden="true" />
						</span>
						<div className="space-y-1">
							<h1 className="text-lg font-semibold tracking-tight">
								Authentication request failed
							</h1>
							<p className="text-sm text-muted-foreground">
								{brand.name} could not complete this authentication flow.
							</p>
						</div>
					</div>

					<Banner variant="error" size="sm" icon={<TriangleAlert className="size-4" aria-hidden="true" />} title={`Authentication service returned ${details.code}`} description={details.description} />

					<div className="rounded-lg border bg-muted/30 px-3 py-2.5">
						<dl className="grid gap-1 text-xs">
							<div className="grid gap-1 sm:grid-cols-[96px_1fr] sm:items-center">
								<dt className="font-medium text-muted-foreground">Error code</dt>
								<dd className="font-mono text-foreground">{details.code}</dd>
							</div>
						</dl>
					</div>
				</CardContent>
				<CardFooter className="flex-col items-stretch gap-3 bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs text-muted-foreground">
						Try signing in again. If this keeps happening, contact your administrator
						with the error code above.
					</p>
					<Button asChild>
						<a href="/sign-in">
							<ArrowLeft className="size-4" aria-hidden="true" />
							Return to sign in
						</a>
					</Button>
				</CardFooter>
			</Card>
		</AuthShell>
	);
}
