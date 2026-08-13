import { useState, type FormEvent } from "react";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";

import { authClient } from "@/auth-client";
import { AuthShell } from "@/components/auth/auth-shell";
import { Wordmark } from "@/components/auth/wordmark";
import { CheckboxField, Field, FieldInput } from "@/components/auth/field";
import { OTPInput } from "@/components/auth/otp-input";
import { Segmented, type SegmentedOption } from "@/components/auth/segmented";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Button } from "@/components/kumo/primitives/button";
import { Card, CardContent } from "@/components/kumo/primitives/card";
import { resolveAuthCallbackURL } from "@/lib/auth-flow";
import { normalizeTwoFactorVerificationCode } from "@/lib/two-factor";

type VerificationMethod = "totp" | "otp" | "backup";

const METHODS: SegmentedOption<VerificationMethod>[] = [
	{ value: "totp", label: "App", icon: ShieldCheck },
	{ value: "otp", label: "Email", icon: Mail },
	{ value: "backup", label: "Backup", icon: KeyRound },
];

const HEADLINES: Record<VerificationMethod, string> = {
	totp: "Enter the 6-digit code from your authenticator app.",
	otp: "We'll email you a one-time code to confirm it's you.",
	backup: "Enter one of your saved single-use backup codes.",
};

export function TwoFactor() {
	const searchParams = new URLSearchParams(window.location.search);
	const callbackURL = resolveAuthCallbackURL(searchParams);
	const [method, setMethod] = useState<VerificationMethod>("totp");
	const [code, setCode] = useState("");
	const [trustDevice, setTrustDevice] = useState(true);
	const [loading, setLoading] = useState(false);
	const [emailSent, setEmailSent] = useState(false);
	const [status, setStatus] = useState<Status | null>(null);

	function selectMethod(next: VerificationMethod) {
		setMethod(next);
		setCode("");
		setStatus(null);
		setEmailSent(false);
	}

	function finish(error: { message?: string } | null | undefined) {
		setLoading(false);
		if (error) {
			setStatus({ tone: "error", message: error.message ?? "Verification failed." });
			setCode("");
			return;
		}
		setStatus({ tone: "success", message: "Verified — redirecting…" });
		window.location.assign(callbackURL);
	}

	async function submit(value: string) {
		setLoading(true);
		setStatus(null);
		const verificationCode = normalizeTwoFactorVerificationCode(method, value);
		if (method === "totp") {
			finish((await authClient.twoFactor.verifyTotp({ code: verificationCode, trustDevice })).error);
			return;
		}
		if (method === "otp") {
			finish((await authClient.twoFactor.verifyOtp({ code: verificationCode, trustDevice })).error);
			return;
		}
		finish((await authClient.twoFactor.verifyBackupCode({ code: verificationCode, trustDevice })).error);
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		void submit(code);
	}

	async function sendEmailCode() {
		setLoading(true);
		setStatus(null);
		const result = await authClient.twoFactor.sendOtp();
		setLoading(false);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not send a code." });
			return;
		}
		setEmailSent(true);
		setStatus({ tone: "success", message: "Verification code sent to your email." });
	}

	const isOTP = method !== "backup";
	const canSubmit = isOTP ? code.length === 6 : code.trim().length > 0;

	return (
		<AuthShell>
			<div className="flex flex-col items-center gap-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<Wordmark className="h-7" />
					<div className="space-y-1">
						<h1 className="text-xl font-semibold tracking-tight">Two-factor verification</h1>
						<p className="text-sm text-muted-foreground">Confirm it's you to finish signing in.</p>
					</div>
				</div>

				<Card className="w-full overflow-hidden gap-0 py-0">
					<Segmented
						value={method}
						onChange={selectMethod}
						options={METHODS}
						aria-label="Verification method"
						className="px-2 pt-2"
					/>
					<CardContent className="space-y-5 px-5 py-5">
						<StatusBanner status={status} />
						<p className="text-sm text-muted-foreground">{HEADLINES[method]}</p>

						<form className="space-y-5" onSubmit={handleSubmit}>
							{method === "otp" && !emailSent ? (
								<Button
									variant="outline"
									className="w-full"
									type="button"
									onClick={sendEmailCode}
									disabled={loading}
								>
									<Mail className="size-4" />
									Send code to email
								</Button>
							) : null}

							{isOTP ? (
								(method === "totp" || emailSent) && (
									<div className="space-y-2">
										<OTPInput
											value={code}
											onChange={setCode}
											disabled={loading}
											autoFocus={method === "totp"}
											aria-label="Verification code"
											onComplete={(value) => void submit(value)}
										/>
									</div>
								)
							) : (
								<Field label="Backup code">
									<FieldInput
										autoComplete="one-time-code"
										placeholder="xxxxxxxx"
										className="font-mono tracking-wider"
										value={code}
										onChange={(event) => setCode(event.target.value)}
										autoFocus
										required
									/>
								</Field>
							)}

							{!isOTP || method === "totp" || emailSent ? (
								<>
									<CheckboxField
										checked={trustDevice}
										onCheckedChange={setTrustDevice}
										label="Trust this device"
										hint="Skip 2FA prompts here for 30 days."
										disabled={loading}
									/>
									<Button className="w-full" type="submit" disabled={loading || !canSubmit}>
										<ShieldCheck className="size-4" />
										Verify
									</Button>
								</>
							) : null}
						</form>
					</CardContent>
				</Card>

				<a
					href="/sign-in"
					className="inline-flex min-h-10 items-center text-xs text-muted-foreground underline-offset-4 transition-[scale,color] duration-150 ease-out hover:text-foreground hover:underline active:scale-[0.96]"
				>
					Use a different account
				</a>
			</div>
		</AuthShell>
	);
}
