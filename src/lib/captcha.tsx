/**
 * Runtime captcha challenge renderer. It receives public captcha config and
 * emits the token Better Auth expects in the `x-captcha-response` header.
 */
import { Turnstile } from "react-turnstile";

import type { CaptchaConfig } from "@/lib/captcha-config";

export function CaptchaChallenge({
	config,
	resetKey,
	action,
	onTokenChange,
}: {
	config: CaptchaConfig;
	resetKey: number;
	action: string;
	onTokenChange: (token: string) => void;
}) {
	if (!config.enabled) return null;

	if (config.provider !== "cloudflare-turnstile" || !config.siteKey) {
		return (
			<p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
				Captcha is enabled, but this browser only supports Cloudflare Turnstile.
			</p>
		);
	}

	return (
		<div className="overflow-hidden rounded-lg border bg-muted/20 p-2">
			<Turnstile
				key={`${config.siteKey}-${resetKey}`}
				sitekey={config.siteKey}
				action={action}
				theme="auto"
				size="flexible"
				onVerify={onTokenChange}
				onExpire={() => onTokenChange("")}
				onError={() => onTokenChange("")}
				onTimeout={() => onTokenChange("")}
			/>
		</div>
	);
}
