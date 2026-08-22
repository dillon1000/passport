/**
 * Runtime captcha configuration loader and request helpers. The Worker
 * endpoint returns only public provider metadata; this hook turns unavailable
 * config into a disabled state so local static/test renders keep working, and
 * the helpers keep each protected Better Auth client call using the same token
 * header and gating messages.
 */
import { useQuery } from "@tanstack/react-query";

import { fetchAPIJSON, queryKeys } from "@/lib/query-client";

type CaptchaConfigResponse =
	| {
			enabled: false;
	  }
	| {
			enabled: true;
		provider: string;
		siteKey: string;
		apiEndpoint: string;
	  };

export type CaptchaConfig = {
	loaded: boolean;
	enabled: boolean;
	provider?: string;
	siteKey?: string;
	apiEndpoint?: string;
};

export type CaptchaFetchOptions = {
	headers: {
		"x-captcha-response": string;
	};
};

export type CaptchaSolver = () => Promise<string>;

const disabledCaptchaConfig: CaptchaConfig = {
	loaded: true,
	enabled: false,
};

async function loadCaptchaConfig(): Promise<CaptchaConfig> {
	try {
		const payload = await fetchAPIJSON<CaptchaConfigResponse>("/api/captcha-config");
		return payload.enabled
			? {
					loaded: true,
					enabled: true,
					provider: payload.provider,
					siteKey: payload.siteKey,
					apiEndpoint: payload.apiEndpoint,
				}
			: disabledCaptchaConfig;
	} catch {
		return disabledCaptchaConfig;
	}
}

export function useCaptchaConfig() {
	const { data: config = { loaded: false, enabled: false } } = useQuery({
		queryKey: queryKeys.captchaConfig(),
		queryFn: loadCaptchaConfig,
		staleTime: Number.POSITIVE_INFINITY,
	});

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

/** Wraps optional CAPTCHA headers for Better Auth calls without changing omitted-field semantics. */
export function captchaClientOptions(fetchOptions: CaptchaFetchOptions | undefined) {
	return fetchOptions ? { fetchOptions } : {};
}

/**
 * Resolves the token already in state or waits for the widget's current solve.
 * A null result means the protected action must pause for configuration or an
 * interactive challenge; undefined means captcha protection is disabled.
 */
export async function resolveCaptchaFetchOptions(
	config: CaptchaConfig,
	token: string,
	solve: CaptchaSolver | null,
): Promise<CaptchaFetchOptions | null | undefined> {
	if (!config.loaded) return null;
	if (!config.enabled) return undefined;

	const resolvedToken = token || (await solve?.()) || "";
	return resolvedToken ? captchaFetchOptions(config, resolvedToken) : null;
}
