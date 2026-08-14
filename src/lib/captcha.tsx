/**
 * Runtime captcha challenge renderer. It receives public captcha config and
 * emits the token Better Auth expects in the `x-captcha-response` header.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import "cap-widget";

import type { CaptchaConfig } from "@/lib/captcha-config";

declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			"cap-widget": {
				key?: string;
				ref?: { current: HTMLElement | null } | ((element: HTMLElement | null) => void);
				style?: CSSProperties;
				[key: `data-cap-${string}`]: string | boolean | undefined;
			};
		}
	}
}

export function CaptchaChallenge({
	config,
	resetKey,
	onTokenChange,
}: {
	config: CaptchaConfig;
	resetKey: number;
	onTokenChange: (token: string) => void;
}) {
	const widgetRef = useRef<HTMLElement>(null);

	useEffect(() => {
		const widget = widgetRef.current;
		if (!widget) return;

	function handleSolve(event: Event) {
			const token = (event as CustomEvent<{ token: string }>).detail.token;
			onTokenChange(token);
		}
		function clearToken() {
			onTokenChange("");
		}

		widget.addEventListener("solve", handleSolve);
		widget.addEventListener("error", clearToken);
		widget.addEventListener("reset", clearToken);
		return () => {
			widget.removeEventListener("solve", handleSolve);
			widget.removeEventListener("error", clearToken);
			widget.removeEventListener("reset", clearToken);
		};
	}, [config.enabled, config.siteKey, onTokenChange, resetKey]);

	if (!config.enabled) return null;

	if (config.provider !== "cap" || !config.apiEndpoint) {
		return (
			<p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
				Captcha is enabled, but this browser only supports Cap.
			</p>
		);
	}

	return (
		<div className="w-full">
			<cap-widget
				key={`${config.siteKey}-${resetKey}`}
				ref={widgetRef}
				data-cap-api-endpoint={config.apiEndpoint}
				data-cap-disable-haptics
				data-cap-i18n-initial-state="Verify your sign-in"
				data-cap-i18n-verifying-label="Verifying sign-in…"
				data-cap-i18n-solved-label="Sign-in verified"
				data-cap-i18n-error-label="Verification failed"
				style={{
					display: "block",
					width: "100%",
					"--cap-background": "var(--card)",
					"--cap-border-color": "var(--border)",
					"--cap-border-radius": "var(--radius)",
					"--cap-widget-width": "100%",
					"--cap-color": "var(--foreground)",
					"--cap-checkbox-background": "var(--background)",
					"--cap-checkbox-border": "1px solid var(--input)",
					"--cap-checkbox-border-radius": "calc(var(--radius) - 2px)",
					"--cap-font": "var(--font-sans)",
					"--cap-spinner-color": "var(--foreground)",
					"--cap-spinner-background-color": "var(--muted)",
				} as CSSProperties}
			/>
		</div>
	);
}
