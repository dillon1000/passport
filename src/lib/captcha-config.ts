/**
 * Runtime captcha configuration loader and request helpers. The Worker
 * endpoint returns only public provider metadata; this hook turns unavailable
 * config into a disabled state so local static/test renders keep working, and
 * the helpers keep each protected Better Auth client call using the same token
 * header and gating messages.
 */
import { useEffect, useState } from "react";

type CaptchaConfigResponse =
	| {
			enabled: false;
	  }
	| {
			enabled: true;
			provider: string;
			siteKey: string;
	  };

export type CaptchaConfig = {
	loaded: boolean;
	enabled: boolean;
	provider?: string;
	siteKey?: string;
};

export type CaptchaFetchOptions = {
	headers: {
		"x-captcha-response": string;
	};
};

const disabledCaptchaConfig: CaptchaConfig = {
	loaded: true,
	enabled: false,
};

export function useCaptchaConfig() {
	const [config, setConfig] = useState<CaptchaConfig>({ loaded: false, enabled: false });

	useEffect(() => {
		let cancelled = false;
		async function loadCaptchaConfig() {
			try {
				const response = await fetch("/api/captcha-config");
				if (!response.ok) {
					if (!cancelled) setConfig(disabledCaptchaConfig);
					return;
				}
				const payload = (await response.json()) as CaptchaConfigResponse;
				if (cancelled) return;
				setConfig(
					payload.enabled
						? {
								loaded: true,
								enabled: true,
								provider: payload.provider,
								siteKey: payload.siteKey,
							}
						: disabledCaptchaConfig,
				);
			} catch {
				if (!cancelled) setConfig(disabledCaptchaConfig);
			}
		}
		void loadCaptchaConfig();
		return () => {
			cancelled = true;
		};
	}, []);

	return config;
}

export function captchaRequirementMessage(config: CaptchaConfig, token: string) {
	if (!config.loaded) return "Captcha is still loading.";
	if (config.enabled && !token) return "Complete the captcha challenge.";
	return null;
}

export function captchaFetchOptions(
	config: CaptchaConfig,
	token: string,
): CaptchaFetchOptions | undefined {
	if (!config.enabled) return undefined;

	return {
		headers: {
			"x-captcha-response": token,
		},
	};
}
