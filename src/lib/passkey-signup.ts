/**
 * Encodes the small, validated account payload that crosses the two-step
 * WebAuthn registration ceremony. Better Auth stores this opaque context with
 * the challenge, so the server validates it again after credential proof.
 */
import { z } from "zod";

const passkeySignupSchema = z.object({
	name: z.string().trim().min(1).max(100),
	email: z.email().max(320).transform((value) => value.toLowerCase()),
	callbackURL: z
		.string()
		.refine(
			(value) => value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"),
			"Callback URL must be a local path.",
		),
});

export type PasskeySignup = z.infer<typeof passkeySignupSchema>;

function encodeBase64Url(value: string) {
	const bytes = new TextEncoder().encode(value);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string) {
	const padded = value
		.replaceAll("-", "+")
		.replaceAll("_", "/")
		.padEnd(Math.ceil(value.length / 4) * 4, "=");
	const binary = atob(padded);
	return new TextDecoder().decode(
		Uint8Array.from(binary, (character) => character.charCodeAt(0)),
	);
}

export function createPasskeySignupContext(input: PasskeySignup) {
	return encodeBase64Url(JSON.stringify(passkeySignupSchema.parse(input)));
}

export function parsePasskeySignupContext(context: string | null | undefined) {
	if (!context) return null;
	try {
		return passkeySignupSchema.parse(JSON.parse(decodeBase64Url(context)));
	} catch {
		return null;
	}
}
