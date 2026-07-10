/**
 * Two-factor verification input helpers. Inputs come from the challenge page's
 * OTP and backup-code controls; outputs are the exact code strings sent to
 * Better Auth. Keep this file limited to client-side normalization that is safe
 * for all configured 2FA methods, and leave validation rules on the server.
 */
export type TwoFactorVerificationMethod = "totp" | "otp" | "backup";

export function normalizeTwoFactorVerificationCode(
	_method: TwoFactorVerificationMethod,
	value: string,
) {
	return value.trim();
}
