/**
 * Runtime captcha challenge renderer. It receives public captcha config and
 * emits the token Better Auth expects in the `x-captcha-response` header.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import "cap-widget";

import type { CaptchaConfig } from "@/lib/captcha-config";

type CapWidgetElement = HTMLElement & {
	solve: () => Promise<{ success: boolean; token: string }>;
};

declare module "react" {
	// React exposes custom element typing through this declaration namespace.
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace JSX {
		interface IntrinsicElements {
			"cap-widget": {
				key?: string;
				ref?: { current: CapWidgetElement | null } | ((element: CapWidgetElement | null) => void);
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
	invisible = false,
	escalated = false,
	reserveSpace = true,
}: {
	config: CaptchaConfig;
	resetKey: number;
	onTokenChange: (token: string) => void;
	/** Solves Cap in the background while keeping a stable fallback slot. */
	invisible?: boolean;
	/** Shows the interactive widget after the session needs extra verification. */
	escalated?: boolean;
	/** Keeps the interactive fallback from moving later controls when it appears. */
	reserveSpace?: boolean;
}) {
	const widgetRef = useRef<CapWidgetElement>(null);

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
		if (invisible && !escalated) {
			void widget.solve().catch(clearToken);
		}
		return () => {
			widget.removeEventListener("solve", handleSolve);
			widget.removeEventListener("error", clearToken);
			widget.removeEventListener("reset", clearToken);
		};
	}, [config.enabled, config.siteKey, escalated, invisible, onTokenChange, resetKey]);

	if (!config.enabled) return null;

	if (config.provider !== "cap" || !config.apiEndpoint) {
		return (
			<p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
				Captcha is enabled, but this browser only supports Cap.
			</p>
		);
	}

	return (
		<div className={invisible && reserveSpace ? "relative min-h-14 w-full" : "w-full"}>
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
					display: invisible && !escalated ? "none" : "block",
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
