/**
 * Focused second-factor sign-in interstitial. Inputs are the pending Better
 * Auth session and callback URL; successful verification resumes that callback,
 * while recoverable errors restore the populated verification screen.
 */
import { useState, type FormEvent } from "react";
import { KeyRound, Mail, MailCheck, ShieldCheck } from "@/lib/icons";

import { authClient } from "@/auth-client";
import { AuthShell } from "@/components/auth/auth-shell";
import { FastAuthSpinner } from "@/components/auth/fast-auth-spinner";
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
type PendingAction = "send-email" | "verify" | null;

const METHODS: SegmentedOption<VerificationMethod>[] = [
	{ value: "totp", label: "App", icon: ShieldCheck },
	{ value: "otp", label: "Email", icon: Mail },
	{ value: "backup", label: "Backup", icon: KeyRound },
];

const HEADLINES = {
	totp: "Enter the 6-digit code from your authenticator app.",
	otp: "We'll email you a one-time code to confirm it's you.",
	backup: "Enter one of your saved single-use backup codes.",
} satisfies Record<VerificationMethod, string>;

export function TwoFactor() {
	const searchParams = new URLSearchParams(window.location.search);
	const callbackURL = resolveAuthCallbackURL(searchParams);
	const [method, setMethod] = useState<VerificationMethod>("totp");
	const [code, setCode] = useState("");
	const [trustDevice, setTrustDevice] = useState(true);
	const [pendingAction, setPendingAction] = useState<PendingAction>(null);
	const [emailSent, setEmailSent] = useState(false);
	const [status, setStatus] = useState<Status | null>(null);
	const loading = pendingAction !== null;

	function selectMethod(next: VerificationMethod) {
		setMethod(next);
		setCode("");
		setStatus(null);
		setEmailSent(false);
	}

	function finish(error: { message?: string } | null | undefined) {
		if (error) {
			setPendingAction(null);
			setStatus({ tone: "error", message: error.message ?? "Verification failed." });
			setCode("");
			return;
		}
		requestAnimationFrame(() => window.location.assign(callbackURL));
	}

	async function submit(value: string) {
		setPendingAction("verify");
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
		setPendingAction("send-email");
		setStatus(null);
		const result = await authClient.twoFactor.sendOtp();
		setPendingAction(null);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not send a code." });
			return;
		}
		setEmailSent(true);
		setCode("");
	}

	const isOTP = method !== "backup";
	const canSubmit = isOTP ? code.length === 6 : code.trim().length > 0;

	return (
		<AuthShell focused>
			<Card
				aria-busy={loading}
				className="relative w-full overflow-hidden gap-0 py-0 [view-transition-name:auth-step]"
			>
				<div
					aria-hidden={loading}
					className={`transition-[translate,opacity] duration-150 ease-out ${
						loading ? "pointer-events-none -translate-x-6 opacity-0" : "translate-x-0 opacity-100"
					}`}
					inert={loading ? true : undefined}
				>
					<CardContent className="space-y-5 p-7">
						{emailSent ? (
							<>
								<div className="space-y-7">
									<Wordmark className="h-7" />
									<div className="space-y-2">
										<div className="grid size-12 place-items-center rounded-xl bg-muted text-foreground">
											<MailCheck aria-hidden="true" className="size-7" />
										</div>
										<h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
									</div>
								</div>
								<StatusBanner status={status} />
								<p className="text-sm text-pretty text-muted-foreground">
									Enter the six-digit verification code sent to the email address on your account.
								</p>
								<form className="space-y-5" onSubmit={handleSubmit}>
									<OTPInput
										value={code}
										onChange={setCode}
										disabled={loading}
										autoFocus
										aria-label="Email verification code"
										onComplete={(value) => void submit(value)}
									/>
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
								</form>
								<Button className="w-full" variant="outline" type="button" onClick={sendEmailCode} disabled={loading}>
									<Mail className="size-4" />
									Resend code
								</Button>
								<button
									type="button"
									className="mx-auto flex min-h-8 items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
									onClick={() => {
										setEmailSent(false);
										setCode("");
										setStatus(null);
									}}
								>
									Use another verification method
								</button>
							</>
						) : (
							<>
								<div className="space-y-7">
									<Wordmark className="h-7" />
									<div className="space-y-1">
										<h1 className="text-2xl font-semibold tracking-tight">Verify it's you</h1>
										<p className="text-sm text-muted-foreground">Complete the second step to finish signing in.</p>
									</div>
								</div>

								<Segmented
									value={method}
									onChange={selectMethod}
									options={METHODS}
									aria-label="Verification method"
								/>
								<StatusBanner status={status} />
								<p className="text-sm text-muted-foreground">{HEADLINES[method]}</p>

								<form className="space-y-5" onSubmit={handleSubmit}>
									{method === "otp" ? (
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

									{method === "totp" ? (
										<OTPInput
											value={code}
											onChange={setCode}
											disabled={loading}
											autoFocus
											aria-label="Verification code"
											onComplete={(value) => void submit(value)}
										/>
									) : method === "backup" ? (
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
									) : null}

									{method !== "otp" ? (
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
								<a
									href="/sign-in"
									className="mx-auto flex min-h-8 w-fit items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
								>
									Use a different account
								</a>
							</>
						)}
					</CardContent>
				</div>

				<div
					aria-hidden={!loading}
					aria-label={pendingAction === "send-email" ? "Sending verification code" : "Verifying"}
					aria-live="polite"
					className={`absolute inset-0 z-10 grid place-items-center bg-card text-muted-foreground transition-[translate,opacity] duration-150 ease-out ${
						loading ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-full opacity-0"
					}`}
					role="status"
				>
					<FastAuthSpinner />
				</div>
			</Card>
		</AuthShell>
	);
}
