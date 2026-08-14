/**
 * Browser compatibility error page for sign-in visitors without WebAssembly.
 * It explains why the CAPTCHA cannot run and directs users to a supported
 * browser without exposing an authentication action.
 */
import { TriangleAlert } from "@/lib/icons";
import { Banner } from "@cloudflare/kumo";

import { AuthShell } from "@/components/auth/auth-shell";
import { Card, CardContent, CardFooter } from "@/components/kumo/primitives/card";
import { useBrand } from "@/lib/brand-runtime";

export function NoWebAssembly() {
	const brand = useBrand();

	return (
		<AuthShell breadcrumb="Browser support">
			<Card className="gap-0 py-0">
				<CardContent className="space-y-5 px-6 py-6">
					<div className="flex items-start gap-3">
						<span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-destructive/10 text-destructive">
							<TriangleAlert className="size-5" aria-hidden="true" />
						</span>
						<div className="space-y-1">
							<h1 className="text-lg font-semibold tracking-tight">WebAssembly is required</h1>
							<p className="text-sm text-muted-foreground">
								{brand.name} cannot sign you in with this browser configuration.
							</p>
						</div>
					</div>

					<Banner
						variant="error"
						size="sm"
						icon={<TriangleAlert className="size-4" aria-hidden="true" />}
						title="Enable WebAssembly to continue"
						description="Passport requires WebAssembly to run its CAPTCHA challenge. Enable WebAssembly or use a supported browser, then try again."
					/>
				</CardContent>
				<CardFooter className="bg-muted/40">
					<p className="text-xs text-muted-foreground">
						WebAssembly must remain enabled while you sign in or create an account.
					</p>
				</CardFooter>
			</Card>
		</AuthShell>
	);
}
