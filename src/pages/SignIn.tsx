/**
 * Sign-in and account recovery page. Inputs are URL query params, runtime brand
 * and captcha config, and Better Auth client methods; outputs are auth
 * redirects, reset-link email requests, and reset-password submissions.
 * Safe changes are mode copy, visible recovery options, and callback handling.
 */
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Fingerprint, LogIn, Mail } from "@/lib/icons";
import { Loader } from "@cloudflare/kumo";
import { useQuery } from "@tanstack/react-query";

import { AuthShell } from "@/components/auth/auth-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/kumo/primitives/avatar";
import { Badge } from "@/components/kumo/primitives/badge";
import { Field, FieldInput, FieldPasswordInput } from "@/components/auth/field";
import { PasswordStrength } from "@/components/auth/password-strength";
import { type SocialProviderId } from "@/components/auth/social-provider-config";
import { SocialButtons } from "@/components/auth/social-buttons";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Wordmark } from "@/components/auth/wordmark";
import { Button } from "@/components/kumo/primitives/button";
import { Card, CardContent } from "@/components/kumo/primitives/card";
import { Separator } from "@/components/kumo/primitives/separator";
import { authClient } from "@/auth-client";
import {
	resolveAuthCallbackURL,
	resolveAddAccountURL,
	resolvePasswordResetRedirectURL,
	shouldCompletePasswordSignIn,
} from "@/lib/auth-flow";
import { CaptchaChallenge } from "@/lib/captcha";
import {
	captchaFetchOptions,
	captchaRequirementMessage,
	useCaptchaConfig,
} from "@/lib/captcha-config";
import {
	getPasswordConfirmationError,
	isPasswordConfirmationReady,
} from "@/lib/password-confirmation";
import { initialsOf } from "@/lib/session";
import { useAccountSwitch } from "@/lib/account-switch";
import { withViewTransition } from "@/lib/view-transition";

type Mode = "signin" | "signup" | "recovery" | "reset";
type FieldErrorTarget = "credential" | "confirmPassword";

interface FieldError {
	target: FieldErrorTarget;
	message: string;
}

/** A same-browser session that can become the active Passport account. */
type DeviceAccount = {
	session: { token: string };
	user: { id: string; name: string; email: string; image?: string | null };
};

async function fetchDeviceAccounts(): Promise<DeviceAccount[]> {
	const result = await authClient.multiSession.listDeviceSessions();
	if (result.error) throw new Error(result.error.message ?? "Could not load signed-in accounts.");
	return (result.data ?? []) as DeviceAccount[];
}

function copyFor(mode: Mode) {
	return {
		signin: {
			title: "Sign in",
			action: "Sign in",
			toggle: "Don't have an account?",
			switchTo: "Create one",
		},
		signup: {
			title: "Create your account",
			action: "Create account",
			toggle: "Already have an account?",
			switchTo: "Sign in",
		},
		recovery: {
			title: "Recover account access",
			action: "Send reset link",
			toggle: "Remembered your credentials?",
			switchTo: "Sign in",
		},
		reset: {
			title: "Set a new password",
			action: "Update password",
			toggle: "Need a new link?",
			switchTo: "Send reset link",
		},
	}[mode];
}

function titleFor(mode: Mode, addingAccount: boolean) {
	if (mode === "signin" && addingAccount) return "Add an account";
	return copyFor(mode).title;
}

function credentialLooksLikeEmail(value: string) {
	return value.includes("@");
}

export function SignIn() {
	const searchParams = new URLSearchParams(window.location.search);
	const resetToken = searchParams.get("token");
	const formRef = useRef<HTMLFormElement>(null);
	const [mode, setMode] = useState<Mode>(
		resetToken ? "reset" : searchParams.get("flow") === "reset-password" ? "recovery" : "signin",
	);
	const [credential, setCredential] = useState("");
	const [password, setPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [name, setName] = useState("");
	const [username, setUsername] = useState("");
	const [fieldError, setFieldError] = useState<FieldError | null>(null);
	const [captchaToken, setCaptchaToken] = useState("");
	const [captchaResetKey, setCaptchaResetKey] = useState(0);
	const [status, setStatus] = useState<Status | null>(() => {
		if (searchParams.get("flow") === "reset-password" && searchParams.get("error")) {
			return {
				tone: "error",
				message: `Password reset link failed: ${searchParams.get("error")}`,
			};
		}
		if (searchParams.get("verified") === "1") {
			return { tone: "success", message: "Email verified — sign in to continue." };
		}
		if (searchParams.get("signedOut") === "1") {
			return { tone: "success", message: "Signed out." };
		}
		if (searchParams.get("deleted") === "1") {
			return { tone: "success", message: "Account deleted." };
		}
		if (searchParams.get("error")) {
			return { tone: "error", message: `Email verification failed: ${searchParams.get("error")}` };
		}
		return null;
	});
	const [loading, setLoading] = useState(false);
	const captchaConfig = useCaptchaConfig();
	const { data: session } = authClient.useSession();
	const beginAccountSwitch = useAccountSwitch((state) => state.begin);
	const clearAccountSwitch = useAccountSwitch((state) => state.clear);
	const lastUsedSignInMethod = authClient.getLastUsedLoginMethod();

	const callbackURL = resolveAuthCallbackURL(searchParams);
	const addingAccount = searchParams.get("flow") === "add-account";
	const canChooseExistingAccount = mode === "signin" && !addingAccount && Boolean(session?.user);
	const accountsQuery = useQuery({
		queryKey: ["signin-device-accounts", session?.user.id],
		queryFn: fetchDeviceAccounts,
		enabled: canChooseExistingAccount,
	});
	const otherAccounts = (accountsQuery.data ?? []).filter(
		(account) => account.user.id !== session?.user.id,
	);
	const verificationCallbackURL = "/account?verified=1";
	const copy = copyFor(mode);
	const authActionsDisabled = loading || (mode !== "reset" && !captchaConfig.loaded);
	const signupPasswordReady =
		mode !== "signup" || isPasswordConfirmationReady(password, confirmPassword);
	const signupConfirmationError =
		mode === "signup" && confirmPassword && password !== confirmPassword
			? "Passwords don't match."
			: mode === "signup" &&
				  fieldError?.target === "confirmPassword" &&
				  !isPasswordConfirmationReady(password, confirmPassword)
				? fieldError.message
				: undefined;
	const credentialError = fieldError?.target === "credential" ? fieldError.message : undefined;
	const resetConfirmationError =
		mode === "reset" &&
		fieldError?.target === "confirmPassword" &&
		getPasswordConfirmationError(newPassword, confirmPassword)
			? fieldError.message
			: undefined;

	function switchMode(nextMode: Mode) {
		setFieldError(null);
		setCaptchaToken("");
		withViewTransition(() => setMode(nextMode));
	}

	function toggleMode() {
		switchMode(mode === "signin" ? "signup" : "signin");
	}

	/** Activates the selected local session, then resumes the original destination. */
	async function continueSession(sessionToken: string, account: DeviceAccount["user"]) {
		setStatus(null);
		setLoading(true);
		beginAccountSwitch(account);

		if (sessionToken !== session?.session.token) {
			const result = await authClient.multiSession.setActive({ sessionToken });
			if (result.error) {
				setLoading(false);
				clearAccountSwitch();
				setStatus({ tone: "error", message: result.error.message ?? "Could not switch accounts." });
				return;
			}
		}

		requestAnimationFrame(() => window.location.assign(callbackURL));
	}

	function resetCaptcha() {
		setCaptchaToken("");
		setCaptchaResetKey((current) => current + 1);
	}

	function requireCaptcha() {
		const message = captchaRequirementMessage(captchaConfig, captchaToken);
		if (message) {
			setStatus({ tone: "error", message });
			return null;
		}
		return captchaFetchOptions(captchaConfig, captchaToken);
	}

	async function submitPassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFieldError(null);
		setStatus(null);

		const credentialValue = credential.trim();
		if (!credentialValue) {
			setFieldError({
				target: "credential",
				message: mode === "signin" ? "Enter your email or username." : "Enter your email.",
			});
			return;
		}

		if (mode === "signup") {
			const confirmationError = getPasswordConfirmationError(password, confirmPassword);
			if (confirmationError) {
				setFieldError({ target: "confirmPassword", message: confirmationError });
				return;
			}
		}

		const authFetchOptions = requireCaptcha();
		if (authFetchOptions === null) {
			return;
		}

		setLoading(true);

		const result =
			mode === "signin"
				? credentialLooksLikeEmail(credentialValue)
					? await authClient.signIn.email({
							email: credentialValue,
							password,
							callbackURL,
							...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
						})
					: await authClient.signIn.username({
							username: credentialValue,
							password,
							callbackURL,
							...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
						})
				: await authClient.signUp.email({
						email: credentialValue,
						password,
						name: name || credentialValue,
						username: username || undefined,
						callbackURL: verificationCallbackURL,
						...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
					});

		setLoading(false);

		if (result.error) {
			resetCaptcha();
			setStatus({ tone: "error", message: result.error.message ?? "Authentication failed." });
			return;
		}

		if (mode === "signin") {
			if (!shouldCompletePasswordSignIn(result)) {
				setStatus({ tone: "success", message: "Confirm your second factor to finish signing in." });
				return;
			}

			setStatus({ tone: "success", message: "Signed in — redirecting…" });
			window.location.assign(callbackURL);
			return;
		}
		setStatus({
			tone: "success",
			message: "Account created. Check your email if verification is required.",
		});
	}

	function handleShortcut(event: KeyboardEvent<HTMLFormElement>) {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			formRef.current?.requestSubmit();
		}
	}

	async function sendMagicLink() {
		const email = credential.trim();
		if (!credentialLooksLikeEmail(email)) {
			setFieldError({
				target: "credential",
				message: "Enter your account email to receive a magic link.",
			});
			return;
		}
		setFieldError(null);
		setStatus(null);

		const authFetchOptions = requireCaptcha();
		if (authFetchOptions === null) {
			return;
		}

		setLoading(true);
		const result = await authClient.signIn.magicLink({
			email,
			callbackURL,
			...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
		});
		setLoading(false);
		resetCaptcha();
		setStatus(
			result.error
				? { tone: "error", message: result.error.message ?? "Could not send magic link." }
				: { tone: "success", message: "Magic link sent. Check your email." },
		);
	}

	async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFieldError(null);
		setStatus(null);

		const email = credential.trim();
		if (!credentialLooksLikeEmail(email)) {
			setFieldError({ target: "credential", message: "Enter the email address on your account." });
			return;
		}

		const authFetchOptions = requireCaptcha();
		if (authFetchOptions === null) {
			return;
		}

		setLoading(true);
		const result = await authClient.requestPasswordReset({
			email,
			redirectTo: resolvePasswordResetRedirectURL(searchParams, window.location.origin),
			...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
		});
		setLoading(false);
		resetCaptcha();

		setStatus(
			result.error
				? { tone: "error", message: result.error.message ?? "Could not send reset link." }
				: {
						tone: "success",
						message: "If an account matches that email, a reset link will arrive shortly.",
					},
		);
	}

	async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFieldError(null);
		setStatus(null);

		if (!resetToken) {
			setStatus({ tone: "error", message: "Request a new password reset link." });
			switchMode("recovery");
			return;
		}

		const confirmationError = getPasswordConfirmationError(newPassword, confirmPassword);
		if (confirmationError) {
			setFieldError({ target: "confirmPassword", message: confirmationError });
			return;
		}

		setLoading(true);
		const result = await authClient.resetPassword({
			newPassword,
			token: resetToken,
		});
		setLoading(false);

		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not reset password." });
			return;
		}

		setPassword("");
		setNewPassword("");
		setConfirmPassword("");
		setStatus({ tone: "success", message: "Password updated. Sign in to continue." });
		switchMode("signin");
	}

	async function signInWithPasskey() {
		setFieldError(null);
		setStatus(null);

		const authFetchOptions = requireCaptcha();
		if (authFetchOptions === null) {
			return;
		}

		setLoading(true);
		const result = await authClient.signIn.passkey(
			authFetchOptions ? { fetchOptions: authFetchOptions } : undefined,
		);
		setLoading(false);
		if (result.error) {
			resetCaptcha();
			setStatus({ tone: "error", message: result.error.message ?? "Passkey sign-in failed." });
			return;
		}
		window.location.assign(callbackURL);
	}

	async function social(provider: SocialProviderId) {
		setFieldError(null);
		setStatus(null);

		const authFetchOptions = requireCaptcha();
		if (authFetchOptions === null) {
			return;
		}

		setLoading(true);
		const result = await authClient.signIn.social({
			provider,
			callbackURL,
			...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
		});
		setLoading(false);

		if (result.error) {
			resetCaptcha();
			setStatus({ tone: "error", message: result.error.message ?? "Social sign-in failed." });
		}
	}

	const formSubmitHandler =
		mode === "recovery" ? requestPasswordReset : mode === "reset" ? submitNewPassword : submitPassword;
	const showAlternateSignIn = mode !== "reset";

	return (
		<AuthShell>
			<div className="flex flex-col items-center gap-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<Wordmark className="h-7" />
					<h1 className="text-xl font-semibold tracking-tight">
						{titleFor(mode, addingAccount)}
					</h1>
				</div>

				<Card className="w-full">
					<CardContent className="space-y-4">
						<StatusBanner status={status} />
						{canChooseExistingAccount && session ? (
							<ExistingSessionChoice
								account={session.user}
								otherAccounts={otherAccounts}
								accountsLoading={accountsQuery.isPending}
								callbackURL={callbackURL}
								disabled={loading}
									onChoose={continueSession}
								currentSessionToken={session.session.token}
							/>
						) : (
							<>
								<form
							ref={formRef}
							className="space-y-3.5"
							onSubmit={formSubmitHandler}
							onKeyDown={handleShortcut}
						>
							{mode === "reset" ? (
								<>
									<Field label="New password">
										<FieldPasswordInput
											autoComplete="new-password"
											placeholder="••••••••"
											value={newPassword}
											onChange={(event) => setNewPassword(event.target.value)}
											minLength={8}
											required
										/>
									</Field>
									<Field label="Confirm password" error={resetConfirmationError}>
										<FieldPasswordInput
											autoComplete="new-password"
											placeholder="••••••••"
											value={confirmPassword}
											onChange={(event) => setConfirmPassword(event.target.value)}
											minLength={8}
											required
										/>
									</Field>
								</>
							) : (
								<>
									{mode === "signup" ? (
										<Field label="Name">
											<FieldInput
												autoComplete="name"
												placeholder="Ada Lovelace"
												value={name}
												onChange={(event) => setName(event.target.value)}
											/>
										</Field>
									) : null}
									{mode === "signup" ? (
										<Field label="Username">
											<FieldInput
												autoComplete="username"
												placeholder="ada"
												value={username}
												onChange={(event) => setUsername(event.target.value)}
											/>
										</Field>
									) : null}
									<Field
										label={mode === "signin" ? "Email or username" : "Account email"}
										error={credentialError}
										hint={
											mode === "recovery"
												? "Used for reset links and magic links."
												: undefined
										}
									>
										<FieldInput
											type={mode === "signin" ? "text" : "email"}
											autoComplete={mode === "signin" ? "username" : "email"}
											placeholder={mode === "signin" ? "you@example.com or ada" : "you@example.com"}
											autoFocus
											value={credential}
											onChange={(event) => setCredential(event.target.value)}
											required
										/>
									</Field>
									{mode === "recovery" ? (
										<div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
											<p className="font-medium text-foreground">Forgot your email?</p>
											<p className="mt-1">
												Use a passkey or linked social account below, then update your email
												from Account.
											</p>
										</div>
									) : (
										<>
											{mode === "signup" ? (
												<>
													<Field label="Password">
														<FieldPasswordInput
															autoComplete="new-password"
															placeholder="••••••••"
															value={password}
															onChange={(event) => setPassword(event.target.value)}
															minLength={8}
															required
														/>
													</Field>
													<Field label="Verify password" error={signupConfirmationError}>
														<FieldPasswordInput
															autoComplete="new-password"
															placeholder="••••••••"
															value={confirmPassword}
															onChange={(event) => setConfirmPassword(event.target.value)}
															minLength={8}
															required
														/>
													</Field>
													<PasswordStrength value={password} />
												</>
											) : (
												<>
													<Field label="Password">
														<FieldPasswordInput
															autoComplete="current-password"
															placeholder="••••••••"
															value={password}
															onChange={(event) => setPassword(event.target.value)}
															required
														/>
													</Field>
													<div className="flex justify-end">
														<button
															type="button"
															className="inline-flex min-h-10 cursor-pointer appearance-none items-center border-0 bg-transparent p-0 text-xs font-medium text-muted-foreground underline-offset-4 transition-[scale,color] duration-150 ease-out hover:text-foreground hover:underline active:scale-[0.96] focus-visible:outline-none focus-visible:underline"
															onClick={() => switchMode("recovery")}
														>
															Forgot username, password, or email?
														</button>
													</div>
												</>
											)}
										</>
									)}
									<CaptchaChallenge
										config={captchaConfig}
										resetKey={captchaResetKey}
										onTokenChange={setCaptchaToken}
									/>
								</>
							)}
							<Button
								className="mt-1 w-full"
								size="lg"
								type="submit"
								disabled={authActionsDisabled || !signupPasswordReady}
								aria-keyshortcuts="Meta+Enter Control+Enter"
							>
								<LogIn className="size-4" />
								{copy.action}
								{lastUsedSignInMethod === "email" ? <LastUsedBadge /> : null}
							</Button>
						</form>

						{showAlternateSignIn ? (
							<>
								<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-0.5 text-xs text-muted-foreground">
									<Separator />
									<span>or</span>
									<Separator />
								</div>

								<div className="grid grid-cols-2 gap-2">
									<Button
										variant="outline"
										size="lg"
										type="button"
										className="relative w-full"
										onClick={signInWithPasskey}
										disabled={authActionsDisabled}
									>
										<Fingerprint className="size-4" />
										Passkey
										{lastUsedSignInMethod === "passkey" ? <LastUsedBadge /> : null}
									</Button>
									<Button
										variant="outline"
										size="lg"
										type="button"
										className="relative w-full"
										onClick={sendMagicLink}
										disabled={authActionsDisabled}
									>
										<Mail className="size-4" />
										Magic link
										{lastUsedSignInMethod === "magic-link" ? <LastUsedBadge /> : null}
									</Button>
								</div>

									<SocialButtons
										onSelect={social}
										disabled={authActionsDisabled}
										lastUsedMethod={lastUsedSignInMethod}
									/>
							</>
								) : null}
							</>
						)}
					</CardContent>
				</Card>

				{!canChooseExistingAccount ? (
					<p className="text-sm text-muted-foreground">
						{copy.toggle}{" "}
						<button
							type="button"
							className="inline-flex min-h-10 cursor-pointer appearance-none items-center border-0 bg-transparent p-0 text-sm font-medium text-foreground underline-offset-4 transition-transform duration-150 ease-out hover:underline active:scale-[0.96] focus-visible:outline-none focus-visible:underline"
							onClick={mode === "reset" ? () => switchMode("recovery") : toggleMode}
						>
							{copy.switchTo}
						</button>
					</p>
				) : null}
			</div>
		</AuthShell>
	);
}

/** Marks the control that matches Better Auth's recent sign-in-method cookie. */
function LastUsedBadge() {
	return <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap" variant="secondary">Last used</Badge>;
}

/**
 * Offers an already authenticated visitor two explicit paths: use a local
 * session now or enter credentials for another account in the add-account flow.
 */
function ExistingSessionChoice({
	account,
	otherAccounts,
	accountsLoading,
	callbackURL,
	disabled,
	onChoose,
	currentSessionToken,
}: {
	account: DeviceAccount["user"];
	otherAccounts: DeviceAccount[];
	accountsLoading: boolean;
	callbackURL: string;
	disabled: boolean;
	onChoose: (sessionToken: string, account: DeviceAccount["user"]) => void;
	currentSessionToken: string;
}) {
	return (
		<div className="space-y-4">
			<div className="space-y-1 text-center">
				<p className="text-sm font-medium">You’re already signed in</p>
				<p className="text-sm text-muted-foreground">Choose how you want to continue.</p>
			</div>

			<div className="space-y-2">
				<SessionChoice
					account={account}
					disabled={disabled}
					onChoose={() => onChoose(currentSessionToken, account)}
				/>
				{accountsLoading ? (
					<div aria-label="Loading accounts" className="flex min-h-16 items-center justify-center rounded-lg border bg-background text-muted-foreground" role="status">
						<Loader size="sm" />
					</div>
				) : null}
				{otherAccounts.map((otherAccount) => (
					<SessionChoice
						key={otherAccount.session.token}
						account={otherAccount.user}
						disabled={disabled}
						onChoose={() => onChoose(otherAccount.session.token, otherAccount.user)}
					/>
				))}
			</div>

			<Button asChild className="w-full" variant="outline">
				<a href={resolveAddAccountURL(callbackURL)}>Sign in to another account</a>
			</Button>
		</div>
	);
}

/** Renders one local account that can resume the sign-in destination. */
function SessionChoice({
	account,
	disabled,
	onChoose,
}: {
	account: DeviceAccount["user"];
	disabled: boolean;
	onChoose: () => void;
}) {
	return (
		<button
			type="button"
			className="flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
			disabled={disabled}
			onClick={onChoose}
		>
			<Avatar>
				<AvatarImage src={account.image ?? undefined} />
				<AvatarFallback>{initialsOf(account.name)}</AvatarFallback>
			</Avatar>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">Continue as {account.name}</span>
				<span className="block truncate text-xs text-muted-foreground">{account.email}</span>
			</span>
		</button>
	);
}
