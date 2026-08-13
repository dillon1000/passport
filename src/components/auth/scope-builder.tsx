/**
 * OAuth scope selector for managed client forms. Scope metadata comes from the
 * central registry; callers provide the selected scope names and receive the
 * next registry-ordered selection whenever a checkbox changes. The header can
 * copy the current selection for OAuth client configuration.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
	OAUTH_SCOPE_DEFINITIONS,
	SUPPORTED_OAUTH_SCOPES,
	type OAuthScopeDefinition,
	type SupportedOAuthScope,
} from "@/lib/oauth-scopes";

const SCOPE_CATEGORIES: {
	category: OAuthScopeDefinition["category"];
	label: string;
	description: string;
}[] = [
	{
		category: "identity",
		label: "Identity and profile",
		description: "Sign-in identity and user profile data.",
	},
	{
		category: "account",
		label: "Account and billing",
		description: "Account security, connections, permissions, and billing.",
	},
	{
		category: "organization",
		label: "Organizations and teams",
		description: "Organization, invitation, member, and team access.",
	},
];

function scopesForCategory(category: OAuthScopeDefinition["category"]) {
	return SUPPORTED_OAUTH_SCOPES.filter(
		(scope) => OAUTH_SCOPE_DEFINITIONS[scope].category === category,
	);
}

export function ScopeBuilder({
	value,
	onValueChange,
	onCopyError,
}: {
	value: readonly string[];
	onValueChange: (value: SupportedOAuthScope[]) => void;
	onCopyError?: (message: string) => void;
}) {
	const legendId = useId();
	const selectedScopes = new Set(value);
	const selectedSupportedScopes = SUPPORTED_OAUTH_SCOPES.filter((scope) => selectedScopes.has(scope));
	const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
	const copyResetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (copyResetTimeout.current) clearTimeout(copyResetTimeout.current);
		},
		[],
	);

	function setScope(scope: SupportedOAuthScope, checked: boolean) {
		onValueChange(
			SUPPORTED_OAUTH_SCOPES.filter((candidate) =>
				candidate === scope ? checked : selectedScopes.has(candidate),
			),
		);
	}

	async function copySelectedScopes() {
		if (copyResetTimeout.current) clearTimeout(copyResetTimeout.current);
		const result = await copyTextToClipboard(selectedSupportedScopes.join(" "));
		if (!result.ok) {
			setCopyStatus("error");
			onCopyError?.(result.message);
			return;
		}
		setCopyStatus("copied");
		copyResetTimeout.current = setTimeout(() => setCopyStatus("idle"), 1500);
	}

	return (
		<fieldset className="flex flex-col gap-3">
			<legend className="sr-only">OAuth scopes</legend>
			<div id={legendId} className="flex flex-wrap items-center justify-between gap-2">
				<span className="text-sm font-medium">Scopes</span>
				<div className="flex items-center gap-2">
					<span className="text-xs tabular-nums text-muted-foreground">
						{selectedSupportedScopes.length} selected
					</span>
					<Button
						type="button"
						variant="outline"
						size="xs"
						disabled={selectedSupportedScopes.length === 0}
						onClick={() => void copySelectedScopes()}
					>
						{copyStatus === "copied" ? (
							<Check data-icon="inline-start" />
						) : (
							<Copy data-icon="inline-start" />
						)}
						<span aria-live="polite">
							{copyStatus === "copied"
								? "Copied selected scopes"
								: copyStatus === "error"
									? "Copy failed"
									: "Copy selected scopes"}
						</span>
					</Button>
				</div>
			</div>
			<div className="flex flex-col gap-3">
				{SCOPE_CATEGORIES.map((group) => (
					<fieldset key={group.category} className="overflow-hidden rounded-lg border">
						<legend className="sr-only">{group.label}</legend>
						<div className="border-b bg-muted/30 px-3 py-2.5">
							<div className="text-xs font-medium">{group.label}</div>
							<p className="text-xs text-muted-foreground">{group.description}</p>
						</div>
						<div className="grid sm:grid-cols-2">
							{scopesForCategory(group.category).map((scope) => {
								const definition = OAUTH_SCOPE_DEFINITIONS[scope];
								const id = `${legendId}-${scope.replaceAll(":", "-")}`;
								return (
									<div
										key={scope}
										className="flex min-w-0 items-start gap-2.5 border-t px-3 py-2.5 first:border-t-0 sm:[&:nth-child(even)]:border-l sm:[&:nth-child(2)]:border-t-0"
									>
										<Checkbox
											id={id}
											checked={selectedScopes.has(scope)}
											onCheckedChange={(checked) => setScope(scope, checked === true)}
											className="mt-0.5"
										/>
										<Label htmlFor={id} className="min-w-0 cursor-pointer font-normal leading-snug">
											<span className="block text-sm">{definition.label}</span>
											<span className="block break-all font-mono text-[0.6875rem] text-muted-foreground">
												{scope}
											</span>
										</Label>
									</div>
								);
							})}
						</div>
					</fieldset>
				))}
			</div>
		</fieldset>
	);
}
