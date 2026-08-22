/**
 * Authentication entry page. Inputs are URL query params, account details,
 * runtime captcha config, and Better Auth client methods; outputs are account
 * creation, sign-in, recovery, and redirect workflows. Local sign-up collects
 * account details, username, and email verification as ordered card steps.
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AtSign, Fingerprint, LogIn, Mail, MailCheck, Pencil } from "@/lib/icons";
import { useQuery } from "@tanstack/react-query";

import { AuthShell } from "@/components/auth/auth-shell";
import { FastAuthSpinner } from "@/components/auth/fast-auth-spinner";
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
	isEmailVerificationRequired,
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
	cancelEmailLinkFlow,
	emailLinkPollDelay,
	pollEmailLinkFlow,
	startEmailLinkFlow,
	type EmailLinkFlow,
} from "@/lib/email-link-continuity";
import {
	withDirectionalViewTransition,
	withViewTransition,
} from "@/lib/view-transition";
import { isWebAssemblyAvailable } from "@/lib/webassembly";
import {
	discoverSignInMethods,
	type SignInMethods,
} from "@/lib/sign-in-methods";
import { MagicLinkPending } from "@/pages/MagicLinkPending";

type Mode = "signin" | "signup" | "recovery" | "reset";
type SignInStep = "identifier" | "methods";
type SignupMethod = "password" | "passkey";
type SignupStep = "details" | "username";
type FieldErrorTarget = "name" | "credential" | "password" | "username" | "confirmPassword";

interface FieldError {
	target: FieldErrorTarget;
	message: string;
}

interface VerificationState {
	email: string | null;
	resendWithUsername: boolean;
	flow: EmailLinkFlow;
}

type WaitingEmailLink = EmailLinkFlow & {
	kind: "magic-link" | "password-reset";
	email: string;
};

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

function getUsernameError(username: string) {
	if (username.length < 3) return "Use at least 3 characters.";
	if (username.length > 30) return "Use no more than 30 characters.";
	if (!/^[a-zA-Z0-9_.]+$/.test(username)) {
		return "Use only letters, numbers, underscores, or periods.";
	}
	return null;
}

function usernameRequestError(error: { code?: string; message?: string }) {
	const detail = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
	if (detail.includes("already") || detail.includes("taken")) return "That username is already in use.";
	if (detail.includes("short")) return "Use at least 3 characters.";
	if (detail.includes("long")) return "Use no more than 30 characters.";
	if (detail.includes("username")) return "Use only letters, numbers, underscores, or periods.";
	return null;
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
	const [signupStep, setSignupStep] = useState<SignupStep>("details");
	const [signupUsername, setSignupUsername] = useState("");
	const [verification, setVerification] = useState<VerificationState | null>(null);
	const [waitingEmailLink, setWaitingEmailLink] = useState<WaitingEmailLink | null>(null);
	const [fieldError, setFieldError] = useState<FieldError | null>(null);
	const [captchaToken, setCaptchaToken] = useState("");
	const [captchaResetKey, setCaptchaResetKey] = useState(0);
	const [captchaEscalated, setCaptchaEscalated] = useState(false);
	const [status, setStatus] = useState<Status | null>(() => {
		if (searchParams.get("emailLinkConsumed") === "1") {
			return { tone: "success", message: "Link confirmed. Your original tab will continue." };
		}
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
	const canChooseExistingAccount =
		!verification && mode === "signin" && !addingAccount && Boolean(session?.user);
	const accountsQuery = useQuery({
		queryKey: ["signin-device-accounts", session?.user.id],
		queryFn: fetchDeviceAccounts,
		enabled: canChooseExistingAccount,
	});
	const otherAccounts = (accountsQuery.data ?? []).filter(
		(account) => account.user.id !== session?.user.id,
	);
	const copy = copyFor(mode);
	const showLoading = loading || sessionPending || (canChooseExistingAccount && accountsQuery.isPending);
	const authActionsDisabled = showLoading;
	const credentialError = fieldError?.target === "credential" ? fieldError.message : undefined;
	const nameError = fieldError?.target === "name" ? fieldError.message : undefined;
	const passwordError = fieldError?.target === "password" ? fieldError.message : undefined;
	const usernameError = fieldError?.target === "username" ? fieldError.message : undefined;
	const resetConfirmationError =
		mode === "reset" &&
		fieldError?.target === "confirmPassword" &&
		getPasswordConfirmationError(newPassword, confirmPassword)
			? fieldError.message
			: undefined;

	useEffect(() => {
		const activeFlow = verification?.flow ?? waitingEmailLink;
		if (!activeFlow) return;
		const flowToken = activeFlow.flow;

		const controller = new AbortController();
		const startedAt = Date.now();
		let timeout: number | undefined;
		async function checkFlow() {
			try {
				const result = await pollEmailLinkFlow(flowToken, controller.signal);
				if (result.status === "complete") {
					setStatus({ tone: "success", message: "Link opened — continuing…" });
					window.location.assign(result.destination);
					return;
				}
				if (result.status === "expired") {
					setVerification(null);
					setWaitingEmailLink(null);
					setStatus({ tone: "error", message: "That email link expired. Send a new one." });
					return;
				}
			} catch (error) {
				if (controller.signal.aborted) return;
				setStatus({
					tone: "error",
					message: error instanceof Error ? error.message : "Could not check the email link.",
				});
			}
			timeout = window.setTimeout(
				() => void checkFlow(),
				emailLinkPollDelay(Date.now() - startedAt),
			);
		}

		void checkFlow();
		return () => {
			controller.abort();
			if (timeout !== undefined) window.clearTimeout(timeout);
		};
	}, [verification?.flow, waitingEmailLink]);

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
		setCaptchaToken("");
		setCaptchaEscalated(false);
		setSignInStep("identifier");
		setSignInMethods(null);
		setSignupStep("details");
		setVerification(null);
		setWaitingEmailLink(null);
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
			if (signupStep === "details") {
				if (!credentialLooksLikeEmail(credentialValue)) {
					setFieldError({ target: "credential", message: "Enter a valid account email." });
					return;
				}
				if (signupMethod === "password") {
					setLoading(true);
					try {
						if ((await checkPwnedPassword(password)) > 0) {
							setFieldError({
								target: "password",
								message: "This password appears in a known data breach. Choose another.",
							});
							return;
						}
					} catch {
						// Availability failures must not turn an optional safety service into an outage.
					} finally {
						setLoading(false);
					}
				}
				withDirectionalViewTransition(() => setSignupStep("username"), "forward");
				return;
			}

			const nextUsername = signupUsername.trim();
			const validationError = getUsernameError(nextUsername);
			if (validationError) {
				setFieldError({ target: "username", message: validationError });
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
		let verificationFlow: EmailLinkFlow;
		try {
			verificationFlow = await startEmailLinkFlow("verification", callbackURL);
		} catch (error) {
			setLoading(false);
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not prepare email verification.",
			});
			return;
		}

		const result =
			mode === "signin"
				? credentialLooksLikeEmail(credentialValue)
					? await authClient.signIn.email({
							email: credentialValue,
							password,
							callbackURL: verificationFlow.callbackURL,
							...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
						})
					: await authClient.signIn.username({
							username: credentialValue,
							password,
							callbackURL: verificationFlow.callbackURL,
							...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
						})
					: await authClient.signUp.email({
							email: credentialValue,
							password,
							name: name.trim(),
							username: signupUsername.trim(),
							displayUsername: signupUsername.trim(),
							callbackURL: verificationFlow.callbackURL,
							...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
					});

		if (result.error) {
			setLoading(false);
			resetCaptcha();
			if (mode === "signin") {
				if (isEmailVerificationRequired(result.error)) {
					setCaptchaEscalated(false);
					setVerification({
						email: credentialLooksLikeEmail(credentialValue) ? credentialValue : null,
						resendWithUsername: !credentialLooksLikeEmail(credentialValue),
						flow: verificationFlow,
					});
					return;
				}
				void cancelEmailLinkFlow(verificationFlow.flow);
				setCaptchaEscalated(true);
				setFieldError({
					target: "password",
					message: "The email, username, or password is incorrect.",
				});
			} else {
				void cancelEmailLinkFlow(verificationFlow.flow);
				const requestError = usernameRequestError(result.error);
				if (requestError) {
					setFieldError({ target: "username", message: requestError });
				} else {
					setStatus({ tone: "error", message: result.error.message ?? "Account creation failed." });
				}
			}
			return;
		}

		if (mode === "signin") {
			void cancelEmailLinkFlow(verificationFlow.flow);
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
		setVerification({ email: credentialValue, resendWithUsername: false, flow: verificationFlow });
	}

	async function signUpWithPasskey() {
		const email = credential.trim();
		if (!credentialLooksLikeEmail(email)) {
			setFieldError({ target: "credential", message: "Enter a valid account email." });
			return;
		}

		const authFetchOptions = await requireCaptcha();
		if (authFetchOptions === null) return;

		setLoading(true);
		let verificationFlow: EmailLinkFlow;
		try {
			verificationFlow = await startEmailLinkFlow("verification", callbackURL);
		} catch (error) {
			setLoading(false);
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not prepare email verification.",
			});
			return;
		}
		const result = await authClient.passkey.addPasskey({
			name: "Passkey",
			context: createPasskeySignupContext({
				name: name.trim(),
				email,
				username: signupUsername.trim(),
				callbackURL: verificationFlow.callbackURL,
			}),
			...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
		});
		if (result.error) {
			void cancelEmailLinkFlow(verificationFlow.flow);
			setLoading(false);
			resetCaptcha();
			const requestError = usernameRequestError(result.error);
			if (isExistingAccountError(result.error)) {
				setStatus({ tone: "error", message: "An account with this email already exists. Sign in instead." });
			} else if (requestError) {
				setFieldError({ target: "username", message: requestError });
			} else {
				setStatus({ tone: "error", message: result.error.message ?? "Passkey creation failed." });
			}
			return;
		}

		setLoading(false);
		setVerification({ email, resendWithUsername: false, flow: verificationFlow });
	}

	/** Sends another verification link without leaving the active auth card. */
	async function resendVerificationEmail() {
		if (!verification) return;
		setStatus(null);
		if (verification.resendWithUsername) {
			const authFetchOptions = await requireCaptcha();
			if (authFetchOptions === null) return;
			const result = await authClient.signIn.username({
				username: credential.trim(),
				password,
				callbackURL: verification.flow.callbackURL,
				...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
			});
			resetCaptcha();
			if (!result.error) {
				window.location.assign(callbackURL);
				return;
			}
			setLoading(false);
			if (!isEmailVerificationRequired(result.error)) {
				setStatus({ tone: "error", message: result.error.message ?? "Could not resend the verification email." });
				return;
			}
		} else if (verification.email) {
			setLoading(true);
			const result = await authClient.sendVerificationEmail({
				email: verification.email,
				callbackURL: verification.flow.callbackURL,
			});
			setLoading(false);
			if (result.error) {
				setStatus({ tone: "error", message: result.error.message ?? "Could not resend the verification email." });
				return;
			}
		}

		setStatus({ tone: "success", message: "Verification email sent." });
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
		let emailLinkFlow: EmailLinkFlow;
		try {
			emailLinkFlow = await startEmailLinkFlow("magic-link", callbackURL);
		} catch (error) {
			setLoading(false);
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not prepare the magic link.",
			});
			return;
		}
		const result = await authClient.signIn.magicLink({
			email,
			callbackURL: emailLinkFlow.callbackURL,
			...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
		});
		setLoading(false);
		resetCaptcha();
		if (result.error) void cancelEmailLinkFlow(emailLinkFlow.flow);
		setWaitingEmailLink(result.error ? null : { ...emailLinkFlow, kind: "magic-link", email });
		setStatus(
			result.error
				? { tone: "error", message: result.error.message ?? "Could not send magic link." }
				: { tone: "success", message: "Magic link sent. This tab will continue when you open it." },
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
		let emailLinkFlow: EmailLinkFlow;
		try {
			emailLinkFlow = await startEmailLinkFlow(
				"password-reset",
				resolvePasswordResetRedirectURL(searchParams, window.location.origin),
			);
		} catch (error) {
			setLoading(false);
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not prepare the reset link.",
			});
			return;
		}
		const result = await authClient.requestPasswordReset({
			email,
			redirectTo: emailLinkFlow.callbackURL,
			...(authFetchOptions ? { fetchOptions: authFetchOptions } : {}),
		});
		setLoading(false);
		resetCaptcha();
		if (result.error) void cancelEmailLinkFlow(emailLinkFlow.flow);
		setWaitingEmailLink(result.error ? null : { ...emailLinkFlow, kind: "password-reset", email });

		setStatus(
			result.error
				? { tone: "error", message: result.error.message ?? "Could not send reset link." }
				: {
						tone: "success",
						message: "If an account matches, this tab will continue when you open the reset link.",
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
	const showAlternateSignIn = !verification && mode !== "reset" && mode !== "signup";
	const signInTitle = verification
		? "Verify your email"
		: mode === "signup" && signupStep === "username"
			? "Choose your username"
			: isMethodStep
				? signInMethods?.password
					? "Enter your password"
					: "Choose how to sign in"
				: titleFor(mode, addingAccount);

	if (waitingEmailLink?.kind === "magic-link") {
		return (
			<AuthShell focused>
				<MagicLinkPending
					email={waitingEmailLink.email}
					loading={loading}
					status={status}
					onResend={() => {
						void cancelEmailLinkFlow(waitingEmailLink.flow);
						void sendMagicLink();
					}}
					onBack={() => {
						void cancelEmailLinkFlow(waitingEmailLink.flow);
						setWaitingEmailLink(null);
						setStatus(null);
					}}
				/>
			</AuthShell>
		);
	}

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
							{verification ? (
								<div className="grid size-12 place-items-center rounded-xl bg-muted text-foreground">
									<MailCheck aria-hidden="true" className="size-7" />
								</div>
							) : (
								<Wordmark className="h-7" />
							)}
							<h1 className="text-2xl font-semibold tracking-tight">{signInTitle}</h1>
						</div>
						<StatusBanner status={status} />
						{verification ? (
							<>
								<VerificationStep
									email={verification.email}
									disabled={authActionsDisabled}
									onResend={() => void resendVerificationEmail()}
									onBack={() => switchMode("signin")}
								/>
								<CaptchaChallenge
									config={captchaConfig}
									resetKey={captchaResetKey}
									onTokenChange={setCaptchaToken}
									solverRef={captchaSolverRef}
									invisible
									escalated={captchaEscalated}
								/>
							</>
						) : canChooseExistingAccount && session ? (
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
								{mode === "signup" && signupStep === "details" ? (
									<div className="space-y-3">
										<Button
											variant="outline"
											size="lg"
											type="button"
											className="w-full"
											onClick={() => {
												setFieldError(null);
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
								{mode === "signup" && signupStep === "username" ? (
									<>
										<p className="text-sm text-muted-foreground text-pretty">
											This is the name people and connected applications can use to find you.
										</p>
										<Field
											label="Username"
											error={usernameError}
											hint="3–30 letters, numbers, underscores, or periods."
											errorAboveControl
										>
											<FieldInput
												autoComplete="username"
												placeholder="ada"
												autoFocus
												value={signupUsername}
												onChange={(event) => {
													setSignupUsername(event.target.value);
													if (fieldError?.target === "username") setFieldError(null);
												}}
												required
											/>
										</Field>
										<CaptchaChallenge
											config={captchaConfig}
											resetKey={captchaResetKey}
											onTokenChange={setCaptchaToken}
											solverRef={captchaSolverRef}
											invisible
											escalated={captchaEscalated}
										/>
									</>
								) : mode === "reset" ? (
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
										error={credentialError}
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
										{mode !== "signup" ? (
											<CaptchaChallenge
												config={captchaConfig}
												resetKey={captchaResetKey}
												onTokenChange={setCaptchaToken}
												solverRef={captchaSolverRef}
												invisible={mode === "signin"}
												escalated={captchaEscalated}
											/>
										) : null}
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
									{isIdentifierStep || (mode === "signup" && signupStep === "details") ? null : mode === "signup" && signupMethod === "passkey" ? (
										<Fingerprint className="size-4" />
									) : mode === "signup" ? (
										<AtSign className="size-4" />
									) : (
										<LogIn className="size-4" />
									)}
								{isIdentifierStep || (mode === "signup" && signupStep === "details")
									? "Continue"
									: mode === "signup" && signupMethod === "passkey"
										? "Create passkey"
										: copy.action}
								{mode === "signin" && !isIdentifierStep && lastUsedSignInMethod === "email" ? <LastUsedBadge /> : null}
								</Button>
							) : null}
							{mode === "signup" && signupStep === "username" ? (
								<button
									type="button"
									className="mx-auto flex min-h-8 items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
									onClick={() => {
										setFieldError(null);
										withDirectionalViewTransition(() => setSignupStep("details"), "backward");
									}}
								>
									Back
								</button>
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
						{!verification && !canChooseExistingAccount ? (
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

/** Keeps email confirmation and resend actions inside the focused auth card. */
function VerificationStep({
	email,
	disabled,
	onResend,
	onBack,
}: {
	email: string | null;
	disabled: boolean;
	onResend: () => void;
	onBack: () => void;
}) {
	return (
		<div className="space-y-4">
			<p className="text-sm text-pretty text-muted-foreground">
				{email ? (
					<>
						Open the verification link we sent to <span className="font-medium text-foreground">{email}</span>.
					</>
				) : (
					"Open the verification link we sent to the email address on your account."
				)}{" "}
				You can continue after you confirm the address.
			</p>
			<Button className="w-full" size="lg" type="button" onClick={onResend} disabled={disabled}>
				<Mail className="size-4" />
				Resend verification email
			</Button>
			<button
				type="button"
				className="mx-auto flex min-h-8 items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
				onClick={onBack}
			>
				Back to sign in
			</button>
		</div>
	);
}
