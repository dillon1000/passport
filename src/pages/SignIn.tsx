/**
 * Authentication entry page. Inputs are URL query params, account details,
 * runtime captcha config, and Better Auth client methods; outputs are account
 * creation, sign-in, recovery, and redirect workflows. Sign-up keeps passkey,
 * social, and password creation distinct so each path asks only for needed data.
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Fingerprint, LogIn, Mail, Pencil } from "@/lib/icons";
import { useQuery } from "@tanstack/react-query";

import { AuthShell } from "@/components/auth/auth-shell";
import { AccountChoice } from "@/components/auth/account-choice";
import { Badge } from "@/components/kumo/primitives/badge";
import { Field, FieldInput, FieldPasswordInput } from "@/components/auth/field";
import { PasswordStrength } from "@/components/auth/password-strength";
import {
	SOCIAL_PROVIDERS,
	type SocialProviderId,
} from "@/components/auth/social-provider-config";
import { SocialButtons } from "@/components/auth/social-buttons";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Wordmark } from "@/components/auth/wordmark";
import { Button } from "@/components/kumo/primitives/button";
import { Card, CardContent, CardFooter } from "@/components/kumo/primitives/card";
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
	resolveCaptchaFetchOptions,
	type CaptchaSolver,
	useCaptchaConfig,
} from "@/lib/captcha-config";
import {
	getPasswordConfirmationError,
} from "@/lib/password-confirmation";
import { createPasskeySignupContext } from "@/lib/passkey-signup";
import { checkPwnedPassword } from "@/lib/pwned-passwords";
import {
	withDirectionalViewTransition,
	withViewTransition,
} from "@/lib/view-transition";
import { isWebAssemblyAvailable } from "@/lib/webassembly";
import {
	discoverSignInMethods,
	type SignInMethods,
} from "@/lib/sign-in-methods";

type Mode = "signin" | "signup" | "recovery" | "reset";
type SignInStep = "identifier" | "methods";
type SignupMethod = "password" | "passkey";
type FieldErrorTarget = "name" | "credential" | "password" | "confirmPassword";

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

function isExistingAccountError(error: { code?: string; message?: string }) {
	const detail = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
	return detail.includes("user_already_exists") || detail.includes("already exist");
}

export function SignIn() {
	useEffect(() => {
		if (!isWebAssemblyAvailable()) window.location.replace("/error/no-webassembly");
	}, []);

	const searchParams = new URLSearchParams(window.location.search);
	const resetToken = searchParams.get("token");
	const formRef = useRef<HTMLFormElement>(null);
	const conditionalPasskeyStarted = useRef(false);
	const skipNextStepTransition = useRef(false);
	const captchaSolverRef = useRef<CaptchaSolver | null>(null);
	const [mode, setMode] = useState<Mode>(
		resetToken ? "reset" : searchParams.get("flow") === "reset-password" ? "recovery" : "signin",
	);
	const [credential, setCredential] = useState("");
	const [signInStep, setSignInStep] = useState<SignInStep>("identifier");
	const [signInMethods, setSignInMethods] = useState<SignInMethods | null>(null);
	const [password, setPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [name, setName] = useState("");
	const [signupMethod, setSignupMethod] = useState<SignupMethod>("password");
	const [existingAccountEmail, setExistingAccountEmail] = useState<string | null>(null);
	const [fieldError, setFieldError] = useState<FieldError | null>(null);
	const [captchaToken, setCaptchaToken] = useState("");
	const [captchaResetKey, setCaptchaResetKey] = useState(0);
	const [captchaEscalated, setCaptchaEscalated] = useState(false);
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
	const { data: session, isPending: sessionPending } = authClient.useSession();
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
	const showLoading = loading || sessionPending || (canChooseExistingAccount && accountsQuery.isPending);
	const authActionsDisabled = showLoading;
	const credentialError = fieldError?.target === "credential" ? fieldError.message : undefined;
	const nameError = fieldError?.target === "name" ? fieldError.message : undefined;
	const passwordError = fieldError?.target === "password" ? fieldError.message : undefined;
	const resetConfirmationError =
		mode === "reset" &&
		fieldError?.target === "confirmPassword" &&
		getPasswordConfirmationError(newPassword, confirmPassword)
			? fieldError.message
			: undefined;

	useEffect(() => {
		if (
			mode !== "signin" ||
			signInStep !== "identifier" ||
			!captchaConfig.loaded ||
			(captchaConfig.enabled && !captchaToken) ||
			conditionalPasskeyStarted.current
		) {
			return;
		}

		conditionalPasskeyStarted.current = true;
		const fetchOptions = captchaFetchOptions(captchaConfig, captchaToken);
		void authClient.signIn
			.passkey({
				autoFill: true,
				...(fetchOptions ? { fetchOptions } : {}),
			})
			.then((result) => {
				if (!result.error) window.location.assign(callbackURL);
			});
	}, [callbackURL, captchaConfig, captchaToken, mode, signInStep]);

	function switchMode(nextMode: Mode) {
		setFieldError(null);
		setExistingAccountEmail(null);
		setCaptchaToken("");
		setCaptchaEscalated(false);
		setSignInStep("identifier");
		setSignInMethods(null);
		withViewTransition(() => setMode(nextMode));
	}

	function toggleMode() {
		switchMode(mode === "signin" ? "signup" : "signin");
	}

	/** Activates the selected local session, then resumes the original destination. */
	async function continueSession(sessionToken: string) {
		setStatus(null);
		setLoading(true);

		if (sessionToken !== session?.session.token) {
			const result = await authClient.multiSession.setActive({ sessionToken });
			if (result.error) {
				setLoading(false);
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

	async function requireCaptcha() {
		setLoading(true);
		const fetchOptions = await resolveCaptchaFetchOptions(
			captchaConfig,
			captchaToken,
			captchaSolverRef.current,
		);
		if (fetchOptions === null) {
			setLoading(false);
			setCaptchaEscalated(captchaConfig.loaded && captchaConfig.enabled);
			setStatus({
				tone: "error",
				message: captchaRequirementMessage(captchaConfig, "") ?? "Complete the captcha challenge.",
			});
		}
		return fetchOptions;
	}

	async function continueToMethods() {
		const credentialValue = credential.trim();
		if (!credentialValue) {
			setFieldError({ target: "credential", message: "Enter your email or username." });
			return;
		}

		setFieldError(null);
		setStatus(null);
		setLoading(true);
		const skipTransition = skipNextStepTransition.current;
		skipNextStepTransition.current = false;
		try {
			const methods = await discoverSignInMethods(credentialValue);
			setSignInMethods(methods);
			if (skipTransition) {
				setSignInStep("methods");
			} else {
				withDirectionalViewTransition(() => setSignInStep("methods"), "forward");
			}
		} catch (error) {
			setFieldError({
				target: "credential",
				message: error instanceof Error ? error.message : "Could not continue to sign in.",
			});
		} finally {
			setLoading(false);
		}
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
		if (mode === "signin" && signInStep === "identifier") {
			await continueToMethods();
			return;
		}

		if (mode === "signup") {
			if (!name.trim()) {
				setFieldError({ target: "name", message: "Enter what we should call you." });
				return;
			}
			if (signupMethod === "passkey") {
				await signUpWithPasskey();
				return;
			}
		}

		const authFetchOptions = await requireCaptcha();
		if (authFetchOptions === null) {
			return;
		}

		setLoading(true);
		if (mode === "signup") {
			try {
				if ((await checkPwnedPassword(password)) > 0) {
					setFieldError({
						target: "password",
						message: "This password appears in a known data breach. Choose another.",
					});
					setLoading(false);
					return;
				}
			} catch {
				// Availability failures must not turn an optional safety service into an outage.
			}
		}

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
						name: name.trim(),
						callbackURL: verificationCallbackURL,
						...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
					});

		if (result.error) {
			setLoading(false);
			resetCaptcha();
			if (mode === "signin") {
				setCaptchaEscalated(true);
				setFieldError({
					target: "password",
					message: "The email, username, or password is incorrect.",
				});
			} else {
				if (isExistingAccountError(result.error)) {
					setExistingAccountEmail(credentialValue);
					setFieldError({
						target: "credential",
						message: "An account with this email already exists.",
					});
				} else {
					setStatus({ tone: "error", message: result.error.message ?? "Account creation failed." });
				}
			}
			return;
		}

		if (mode === "signin") {
			if (!shouldCompletePasswordSignIn(result)) {
				setLoading(false);
				setStatus({ tone: "success", message: "Confirm your second factor to finish signing in." });
				return;
			}

			setStatus({ tone: "success", message: "Signed in — redirecting…" });
			window.location.assign(callbackURL);
			return;
		}
		setLoading(false);
		setStatus({
			tone: "success",
			message: "Account created. Check your email if verification is required.",
		});
	}

	async function signUpWithPasskey() {
		const email = credential.trim();
		if (!credentialLooksLikeEmail(email)) {
			setFieldError({ target: "credential", message: "Enter a valid account email." });
			return;
		}

		const authFetchOptions = await requireCaptcha();
		if (authFetchOptions === null) return;

		setExistingAccountEmail(null);
		setLoading(true);
		const result = await authClient.passkey.addPasskey({
			name: "Passkey",
			context: createPasskeySignupContext({
				name: name.trim(),
				email,
				callbackURL,
			}),
			...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
		});
		if (result.error) {
			setLoading(false);
			resetCaptcha();
			if (isExistingAccountError(result.error)) {
				setExistingAccountEmail(email);
				setFieldError({ target: "credential", message: "An account with this email already exists." });
			} else {
				setStatus({ tone: "error", message: result.error.message ?? "Passkey creation failed." });
			}
			return;
		}

		window.location.assign(callbackURL);
	}

	function handleShortcut(event: KeyboardEvent<HTMLFormElement>) {
		if (event.key === "Enter") skipNextStepTransition.current = true;
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

		const authFetchOptions = await requireCaptcha();
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

		const authFetchOptions = await requireCaptcha();
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

		const authFetchOptions = await requireCaptcha();
		if (authFetchOptions === null) {
			return;
		}

		setLoading(true);
		const result = await authClient.signIn.passkey(
			authFetchOptions ? { fetchOptions: authFetchOptions } : undefined,
		);
		if (result.error) {
			setLoading(false);
			resetCaptcha();
			setStatus({ tone: "error", message: result.error.message ?? "Passkey sign-in failed." });
			return;
		}
		window.location.assign(callbackURL);
	}

	async function social(provider: SocialProviderId) {
		setFieldError(null);
		setStatus(null);

		const authFetchOptions = await requireCaptcha();
		if (authFetchOptions === null) {
			return;
		}

		setLoading(true);
		const result = await authClient.signIn.social({
			provider,
			callbackURL,
			...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
		});
		if (result.error) {
			setLoading(false);
			resetCaptcha();
			setStatus({ tone: "error", message: result.error.message ?? "Social sign-in failed." });
		}
	}

	const formSubmitHandler =
		mode === "recovery" ? requestPasswordReset : mode === "reset" ? submitNewPassword : submitPassword;
	const isIdentifierStep = mode === "signin" && signInStep === "identifier";
	const isMethodStep = mode === "signin" && signInStep === "methods";
	const showPasskey = !isMethodStep || Boolean(signInMethods?.passkey);
	const showMagicLink = mode !== "signin" || Boolean(isMethodStep && signInMethods?.magicLink);
	const lastUsedSocialProvider = SOCIAL_PROVIDERS.some(
		(provider) => provider.id === lastUsedSignInMethod,
	);
	const showAlternateSignIn = mode !== "reset" && mode !== "signup";
	const signInTitle = isMethodStep
		? signInMethods?.password
			? "Enter your password"
			: "Choose how to sign in"
		: titleFor(mode, addingAccount);

	return (
		<AuthShell focused>
			<div className="flex flex-col items-center gap-6">
				<Card
					aria-busy={showLoading}
					className="relative w-full overflow-hidden [view-transition-name:auth-step]"
				>
					<div
						aria-hidden={showLoading}
						className={`transition-[translate,opacity] duration-150 ease-out ${
							showLoading ? "pointer-events-none -translate-x-6 opacity-0" : "translate-x-0 opacity-100"
						}`}
						inert={showLoading ? true : undefined}
					>
						<CardContent className="space-y-5 p-7">
						<div className="space-y-7">
							<Wordmark className="h-7" />
							<h1 className="text-2xl font-semibold tracking-tight">{signInTitle}</h1>
						</div>
						<StatusBanner status={status} />
						{canChooseExistingAccount && session ? (
							<ExistingSessionChoice
								account={session.user}
								otherAccounts={otherAccounts}
								callbackURL={callbackURL}
								disabled={authActionsDisabled}
								onChoose={continueSession}
								currentSessionToken={session.session.token}
							/>
						) : (
							<>
								{mode === "signup" ? (
									<div className="space-y-3">
										<Button
											variant="outline"
											size="lg"
											type="button"
											className="w-full"
											onClick={() => {
												setFieldError(null);
												setExistingAccountEmail(null);
												setSignupMethod((current) =>
													current === "password" ? "passkey" : "password",
												);
											}}
											disabled={authActionsDisabled}
										>
											<Fingerprint className="size-4" />
											{signupMethod === "password"
												? "Create with a passkey"
												: "Use a password instead"}
										</Button>
										<SocialButtons
											onSelect={social}
											disabled={authActionsDisabled}
											lastUsedMethod={lastUsedSignInMethod}
										/>
										<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 pt-1 text-xs text-muted-foreground">
											<Separator />
											<span>or use email</span>
											<Separator />
										</div>
									</div>
								) : null}
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
										<Field label="What should we call you?" error={nameError}>
											<FieldInput
												autoComplete="name"
												placeholder="Ada Lovelace"
												value={name}
												onChange={(event) => {
													setName(event.target.value);
													if (fieldError?.target === "name") setFieldError(null);
												}}
												required
											/>
										</Field>
									) : null}
									{isMethodStep ? (
										<button
											type="button"
											className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border bg-background py-1 pr-2.5 pl-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
											onClick={(event) => {
												setFieldError(null);
												setPassword("");
												setCaptchaEscalated(false);
												setSignInMethods(null);
												if (event.detail === 0) {
													setSignInStep("identifier");
												} else {
													withDirectionalViewTransition(
														() => setSignInStep("identifier"),
														"backward",
													);
												}
											}}
										>
											<span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[0.6875rem] uppercase">
												{credential.trim().charAt(0)}
											</span>
											<span className="truncate">{credential.trim()}</span>
											<Pencil aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
											<span className="sr-only">Change email or username</span>
										</button>
									) : (
										<Field
											label={mode === "signin" ? "Email or username" : "Account email"}
										error={
											existingAccountEmail ? (
												<>
													{credentialError}{" "}
													<button
														type="button"
														className="font-semibold underline underline-offset-2"
														onClick={() => switchMode("signin")}
													>
														Sign in with {existingAccountEmail}
													</button>
												</>
											) : credentialError
										}
										errorAboveControl={mode === "signin"}
										hint={
											mode === "recovery"
												? "Used for reset links and magic links."
												: undefined
										}
										>
											<FieldInput
											type={mode === "signin" ? "text" : "email"}
											inputMode="email"
											autoComplete={mode === "signin" ? "username webauthn" : "email"}
											placeholder={mode === "signin" ? "you@example.com or ada" : "you@example.com"}
											autoFocus
											value={credential}
											onChange={(event) => {
												setCredential(event.target.value);
												setExistingAccountEmail(null);
											}}
											required
											/>
										</Field>
									)}
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
													{signupMethod === "password" ? (
														<Field label="Password" error={passwordError} errorAboveControl>
															<FieldPasswordInput
															autoComplete="new-password"
															placeholder="••••••••"
															value={password}
															onChange={(event) => setPassword(event.target.value)}
															minLength={8}
																required
															/>
														</Field>
													) : null}
													{signupMethod === "password" ? (
														<PasswordStrength value={password} userInputs={[name, credential]} />
													) : (
														<p className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
															Your device will ask you to save a passkey. You will not need a password.
														</p>
													)}
												</>
											) : mode !== "signin" || signInMethods?.password ? (
												<>
													<Field label="Password" error={passwordError} errorAboveControl>
														<FieldPasswordInput
															autoComplete="current-password"
															placeholder="••••••••"
															value={password}
															onChange={(event) => setPassword(event.target.value)}
															required
														/>
													</Field>
												</>
											) : null}
										</>
									)}
									<CaptchaChallenge
										config={captchaConfig}
										resetKey={captchaResetKey}
										onTokenChange={setCaptchaToken}
										solverRef={captchaSolverRef}
										invisible={mode === "signin" || mode === "signup"}
										escalated={captchaEscalated}
									/>
								</>
							)}
							{!isMethodStep || signInMethods?.password ? (
								<Button
									className="mt-1 w-full"
									size="lg"
									type="submit"
									disabled={authActionsDisabled}
									aria-keyshortcuts="Meta+Enter Control+Enter"
								>
									{isIdentifierStep ? null : mode === "signup" && signupMethod === "passkey" ? (
										<Fingerprint className="size-4" />
									) : (
										<LogIn className="size-4" />
									)}
								{isIdentifierStep
									? "Continue"
									: mode === "signup" && signupMethod === "passkey"
										? "Create passkey"
										: copy.action}
								{!isIdentifierStep && lastUsedSignInMethod === "email" ? <LastUsedBadge /> : null}
								</Button>
							) : null}
							{isMethodStep && signInMethods?.password ? (
								<button
									type="button"
									className="mx-auto flex min-h-8 items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
									onClick={() => switchMode("recovery")}
								>
									Forgot username, email, or password?
								</button>
							) : null}
						</form>

						{showAlternateSignIn ? (
							<>
								<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-0.5 text-xs text-muted-foreground">
									<Separator />
									<span>or</span>
									<Separator />
								</div>
								{lastUsedSocialProvider ? <SocialButtons
									onSelect={social}
									disabled={authActionsDisabled}
									lastUsedMethod={lastUsedSignInMethod}
								/> : null}

								<div className={showPasskey && showMagicLink ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
									{showPasskey ? <Button
										variant="outline"
										size="lg"
										type="button"
										className={lastUsedSignInMethod === "magic-link" ? "relative order-2 w-full" : "relative w-full"}
										onClick={signInWithPasskey}
										disabled={authActionsDisabled}
									>
										<Fingerprint className="size-4" />
										Passkey
										{lastUsedSignInMethod === "passkey" ? <LastUsedBadge /> : null}
									</Button>
									 : null}
									{showMagicLink ? <Button
										variant="outline"
										size="lg"
										type="button"
										className={lastUsedSignInMethod === "magic-link" ? "relative order-first w-full" : "relative w-full"}
										onClick={sendMagicLink}
										disabled={authActionsDisabled}
									>
										<Mail className="size-4" />
										Magic link
										{lastUsedSignInMethod === "magic-link" ? <LastUsedBadge /> : null}
									</Button>
									 : null}
								</div>

								{!lastUsedSocialProvider ? <SocialButtons
										onSelect={social}
										disabled={authActionsDisabled}
										lastUsedMethod={lastUsedSignInMethod}
									/>
								 : null}
							</>
								) : null}
							</>
						)}
						</CardContent>
						{!canChooseExistingAccount ? (
							<CardFooter className="border-t bg-muted/35 text-sm text-muted-foreground">
								<p>
									{copy.toggle}{" "}
									<button
										type="button"
										className="inline-flex min-h-10 cursor-pointer appearance-none items-center border-0 bg-transparent p-0 text-sm font-medium text-foreground underline-offset-4 transition-transform duration-150 ease-out hover:underline active:scale-[0.96] focus-visible:outline-none focus-visible:underline"
										onClick={mode === "reset" ? () => switchMode("recovery") : toggleMode}
									>
										{copy.switchTo}
									</button>
								</p>
							</CardFooter>
						) : null}
					</div>
					<div
						aria-hidden={!showLoading}
						aria-label="Loading"
						aria-live="polite"
						className={`absolute inset-0 z-10 grid place-items-center bg-card text-muted-foreground transition-[translate,opacity] duration-150 ease-out ${
							showLoading
								? "translate-x-0 opacity-100"
								: "pointer-events-none translate-x-full opacity-0"
						}`}
						role="status"
					>
						<FastAuthSpinner />
					</div>
				</Card>
			</div>
		</AuthShell>
	);
}

/** Marks the control that matches Better Auth's recent sign-in-method cookie. */
function LastUsedBadge() {
	return <Badge className="pointer-events-none absolute -top-3 right-2 whitespace-nowrap" variant="secondary">Last used</Badge>;
}

/**
 * Offers an already authenticated visitor two explicit paths: use a local
 * session now or enter credentials for another account in the add-account flow.
 */
function ExistingSessionChoice({
	account,
	otherAccounts,
	callbackURL,
	disabled,
	onChoose,
	currentSessionToken,
}: {
	account: DeviceAccount["user"];
	otherAccounts: DeviceAccount[];
	callbackURL: string;
	disabled: boolean;
	onChoose: (sessionToken: string) => void;
	currentSessionToken: string;
}) {
	return (
		<div className="space-y-4">
			<div className="space-y-0.5">
				<p className="text-sm font-medium">You’re already signed in</p>
				<p className="text-xs text-muted-foreground">Choose how you want to continue.</p>
			</div>

			<div className="space-y-2">
				<AccountChoice
					account={account}
					label={`Continue as ${account.name}`}
					disabled={disabled}
					onChoose={() => onChoose(currentSessionToken)}
				/>
				{otherAccounts.map((otherAccount) => (
					<AccountChoice
						key={otherAccount.session.token}
						account={otherAccount.user}
						label={`Continue as ${otherAccount.user.name}`}
						disabled={disabled}
						onChoose={() => onChoose(otherAccount.session.token)}
					/>
				))}
			</div>

			<Button asChild className="w-full" variant="outline">
				<a href={resolveAddAccountURL(callbackURL)}>Sign in to another account</a>
			</Button>
		</div>
	);
}

/** Rotates every 550ms so auth progress reads faster than the shared two-second loader. */
function FastAuthSpinner() {
	return (
		<svg
			aria-hidden="true"
			className="size-8 animate-spin [animation-duration:550ms] motion-reduce:animate-none"
			viewBox="0 0 24 24"
		>
			<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.1" />
			<circle
				cx="12"
				cy="12"
				r="9.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeDasharray="42 60"
			/>
		</svg>
	);
}
