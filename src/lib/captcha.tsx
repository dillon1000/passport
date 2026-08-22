/**
 * Runtime captcha challenge renderer. It receives public captcha config and
 * emits the token Better Auth expects in the `x-captcha-response` header.
 */
import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import "cap-widget";

import type { CaptchaConfig, CaptchaSolver } from "@/lib/captcha-config";

type CapWidgetElement = HTMLElement & {
	solve: () => Promise<{ success: boolean; token: string } | undefined>;
	readonly tokenValue?: string | null;
};

type CapWidgetStyle = CSSProperties & { [property: `--cap-${string}`]: string };

const capWidgetStyle: CapWidgetStyle = {
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
};

declare module "react" {
	// React exposes custom element typing through this declaration namespace.
	// oxlint-disable-next-line typescript/no-namespace
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
	solverRef,
	invisible = false,
	escalated = false,
}: {
	config: CaptchaConfig;
	resetKey: number;
	onTokenChange: (token: string) => void;
	/** Shares one in-flight solve with form submission and background work. */
	solverRef: RefObject<CaptchaSolver | null>;
	/** Solves Cap in the background until the session needs a visible challenge. */
	invisible?: boolean;
	/** Shows the interactive widget after the session needs extra verification. */
	escalated?: boolean;
}) {
	const widgetRef = useRef<CapWidgetElement>(null);
	const solvePromiseRef = useRef<Promise<string> | null>(null);

	useEffect(() => {
		const widget = widgetRef.current;
		if (!widget) {
			solverRef.current = null;
			return;
		}
		const activeWidget = widget;

		function solveChallenge() {
			if (solvePromiseRef.current) return solvePromiseRef.current;
			const solvePromise = activeWidget
				.solve()
				.then((result) => result?.token ?? activeWidget.tokenValue ?? "")
				.catch(() => "")
				.finally(() => {
					if (solvePromiseRef.current === solvePromise) solvePromiseRef.current = null;
				});
			solvePromiseRef.current = solvePromise;
			return solvePromise;
		}
		solverRef.current = solveChallenge;

		function handleSolve(event: Event & { detail?: { token?: string } }) {
			onTokenChange(event.detail?.token ?? "");
		}
		function clearToken() {
			onTokenChange("");
		}

		activeWidget.addEventListener("solve", handleSolve);
		activeWidget.addEventListener("error", clearToken);
		activeWidget.addEventListener("reset", clearToken);
		if (invisible && !escalated) {
			void solveChallenge();
		}
		return () => {
			if (solverRef.current === solveChallenge) solverRef.current = null;
			solvePromiseRef.current = null;
			activeWidget.removeEventListener("solve", handleSolve);
			activeWidget.removeEventListener("error", clearToken);
			activeWidget.removeEventListener("reset", clearToken);
		};
	}, [config.enabled, config.siteKey, escalated, invisible, onTokenChange, resetKey, solverRef]);

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
				style={{ ...capWidgetStyle, display: invisible && !escalated ? "none" : "block" }}
			/>
		</div>
	);
}
