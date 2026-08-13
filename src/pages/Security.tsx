/**
 * Security settings page. Inputs are the active Better Auth session plus
 * credential, passkey, and linked-account records; actions mutate account
 * protections and connected providers while keeping provider marks sourced from
 * `public/icons` through the shared social provider config.
 */
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import {
	Check,
	Copy,
	KeyRound,
	LockKeyhole,
	LogOut,
	MailCheck,
	Phone,
	PhoneCall,
	QrCode,
	ShieldCheck,
	ShieldOff,
	Smartphone,
	Trash2,
	Unlink,
} from "lucide-react";
import QRCode from "react-qr-code";

import { AccountActivitySection } from "@/components/auth/account-activity-section";
import { DashboardShell } from "@/components/auth/dashboard-shell";
import { Field, FieldInput, FieldPasswordInput } from "@/components/auth/field";
import { OTPInput } from "@/components/auth/otp-input";
import { PasswordStrength } from "@/components/auth/password-strength";
import { PublicIcon } from "@/components/auth/public-icon";
import { type Section } from "@/components/auth/section-nav";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { SignOutDialog } from "@/components/auth/sign-out-dialog";
import {
	SOCIAL_PROVIDERS,
	type SocialProviderId,
} from "@/components/auth/social-provider-config";
import { StatusBanner, type Status } from "@/components/auth/status";
import { StatusDot, type DotTone } from "@/components/auth/status-dot";
import { SummaryRow } from "@/components/auth/summary-row";
import { Button } from "@/components/kumo/primitives/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/kumo/primitives/dialog";
import {
	Sheet,
	SheetBody,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/kumo/primitives/sheet";
import { Skeleton } from "@/components/kumo/primitives/skeleton";
import { authClient } from "@/auth-client";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
	getPasswordConfirmationError,
	isPasswordConfirmationReady,
} from "@/lib/password-confirmation";
import { queryKeys } from "@/lib/query-client";
import { useRequireSession } from "@/lib/session";
import { normalizeTwoFactorVerificationCode } from "@/lib/two-factor";

const SECTIONS: Section[] = [
	{ id: "passkeys", label: "Passkeys" },
	{ id: "two-factor", label: "2FA" },
	{ id: "accounts", label: "Accounts" },
	{ id: "email", label: "Email" },
	{ id: "phone", label: "Phone" },
	{ id: "password", label: "Password" },
	{ id: "session", label: "Session" },
	{ id: "activity", label: "Activity" },
	{ id: "danger", label: "Danger" },
];

type SecurityUser = {
	id: string;
	name?: string | null;
	email: string;
	emailVerified?: boolean | null;
	image?: string | null;
	phoneNumber?: string | null;
	phoneNumberVerified?: boolean | null;
	twoFactorEnabled?: boolean | null;
};

type PasskeySummary = {
	id: string;
	name?: string | null;
	deviceType?: string | null;
	backedUp?: boolean | null;
	transports?: string | null;
	createdAt?: string | Date | null;
};

type LinkedAccountSummary = {
	id: string;
	providerId: string;
	accountId: string;
	createdAt?: string | Date | null;
};

export type SecurityConfirmationAction =
	| { type: "delete-passkey"; passkeyId: string }
	| { type: "unlink-provider"; account: LinkedAccountSummary }
	| { type: "disable-two-factor" };

type TwoFactorSetup = {
	totpURI: string;
	backupCodes: string[];
};

type SecurityCredentialsPayload = {
	passkeys: PasskeySummary[];
	accounts: LinkedAccountSummary[];
	errorMessage: string | null;
};

async function fetchSecurityCredentials(): Promise<SecurityCredentialsPayload> {
	const [passkeyResult, accountResult] = await Promise.all([
		authClient.passkey.listUserPasskeys(),
		authClient.listAccounts(),
	]);
	const errors: string[] = [];
	if (passkeyResult.error) {
		errors.push(passkeyResult.error.message ?? "Could not load passkeys.");
	}
	if (accountResult.error) {
		errors.push(accountResult.error.message ?? "Could not load connected accounts.");
	}
	return {
		passkeys: passkeyResult.error ? [] : ((passkeyResult.data ?? []) as PasskeySummary[]),
		accounts: accountResult.error
			? []
			: ((accountResult.data ?? []) as LinkedAccountSummary[]),
		errorMessage: errors.length ? errors.join(" ") : null,
	};
}

export function Security() {
	const { data: session } = useRequireSession();
	const searchParams = new URLSearchParams(window.location.search);
	const [status, setStatus] = useState<Status | null>(() => {
		const linkedProvider = searchParams.get("linked");
		const linkError = searchParams.get("linkError") ?? searchParams.get("error");
		if (linkedProvider) {
			return { tone: "success", message: `${linkedProvider} account linked.` };
		}
		if (linkError) {
			return { tone: "error", message: `Could not link account: ${linkError}` };
		}
		return null;
	});
	const [busy, setBusy] = useState(false);
	const [passkeyName, setPasskeyName] = useState("Primary passkey");
	const [phoneCode, setPhoneCode] = useState("");
	const [phoneCodeSent, setPhoneCodeSent] = useState(false);
	const [pendingPhoneNumber, setPendingPhoneNumber] = useState("");
	const [deletePassword, setDeletePassword] = useState("");
	const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
	const [twoFactorSheetOpen, setTwoFactorSheetOpen] = useState(false);
	const [phoneSheetOpen, setPhoneSheetOpen] = useState(false);
	const [passwordSheetOpen, setPasswordSheetOpen] = useState(false);
	const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
	const [twoFactorPassword, setTwoFactorPassword] = useState("");
	const [twoFactorCode, setTwoFactorCode] = useState("");
	const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null);
	const [twoFactorEnabledOverride, setTwoFactorEnabledOverride] = useState<{
		userId: string;
		enabled: boolean;
	} | null>(null);
	const [backupPassword, setBackupPassword] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [backupCopied, setBackupCopied] = useState(false);
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [confirmationAction, setConfirmationAction] =
		useState<SecurityConfirmationAction | null>(null);
	const user = session?.user as SecurityUser | undefined;
	const credentialsQuery = useQuery({
		queryKey: queryKeys.securityCredentials(user?.id),
		queryFn: fetchSecurityCredentials,
		enabled: Boolean(user),
	});
	const passkeys = credentialsQuery.data?.passkeys ?? [];
	const accounts = credentialsQuery.data?.accounts ?? [];
	const credentialsLoaded = credentialsQuery.isFetched;
	const queryStatus =
		status ??
		(credentialsQuery.data?.errorMessage
			? { tone: "error" as const, message: credentialsQuery.data.errorMessage }
			: credentialsQuery.error instanceof Error
				? { tone: "error" as const, message: credentialsQuery.error.message }
				: null);
	const twoFactorEnabled =
		twoFactorEnabledOverride && twoFactorEnabledOverride.userId === user?.id
			? twoFactorEnabledOverride.enabled
			: Boolean(user?.twoFactorEnabled);
	const hasCredentialAccount =
		!credentialsLoaded || accounts.some((account) => account.providerId === "credential");

	function loadCredentials() {
		void credentialsQuery.refetch();
	}

	async function addPasskey(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus(null);
		setBusy(true);
		const result = await authClient.passkey.addPasskey({ name: passkeyName || undefined });
		setBusy(false);
		setStatus(
			result?.error
				? { tone: "error", message: result.error.message ?? "Could not add passkey." }
				: { tone: "success", message: "Passkey added to this account." },
		);
		if (!result?.error) {
			void loadCredentials();
		}
	}

	async function deletePasskey(id: string) {
		setStatus(null);
		setBusy(true);
		const result = await authClient.passkey.deletePasskey({ id });
		setBusy(false);
		setStatus(
			result.error
				? { tone: "error", message: result.error.message ?? "Could not remove passkey." }
				: { tone: "success", message: "Passkey removed." },
		);
		if (!result.error) {
			void loadCredentials();
		}
	}

	async function linkProvider(provider: SocialProviderId) {
		setStatus(null);
		setBusy(true);
		const result = await authClient.linkSocial({
			provider,
			callbackURL: `/security?linked=${encodeURIComponent(provider)}`,
			errorCallbackURL: `/security?linkError=${encodeURIComponent(provider)}`,
		});
		setBusy(false);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not link account." });
		}
	}

	async function unlinkProvider(account: LinkedAccountSummary) {
		setStatus(null);
		setBusy(true);
		const result = await authClient.unlinkAccount({
			providerId: account.providerId,
			accountId: account.accountId,
		});
		setBusy(false);
		setStatus(
			result.error
				? { tone: "error", message: result.error.message ?? "Could not unlink account." }
				: { tone: "success", message: "Account unlinked." },
		);
		if (!result.error) {
			void loadCredentials();
		}
	}

	async function enableTwoFactor(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus(null);
		setBusy(true);
		const result = await authClient.twoFactor.enable({
			password: twoFactorPassword,
			issuer: "Passport",
		});
		setBusy(false);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not enable 2FA." });
			return;
		}
		const data = result.data as TwoFactorSetup | null;
		if (!data?.totpURI) {
			setStatus({ tone: "error", message: "2FA setup did not return a TOTP URI." });
			return;
		}
		setTwoFactorSetup(data);
		setBackupCodes(data.backupCodes ?? []);
		setStatus({
			tone: "success",
			message: "Scan the QR code, then verify the first authenticator code.",
		});
	}

	async function verifyTwoFactor(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus(null);
		setBusy(true);
		const result = await authClient.twoFactor.verifyTotp({
			code: normalizeTwoFactorVerificationCode("totp", twoFactorCode),
			trustDevice: true,
		});
		setBusy(false);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not verify 2FA." });
			return;
		}
		if (user) {
			setTwoFactorEnabledOverride({ userId: user.id, enabled: true });
		}
		setTwoFactorSetup(null);
		setTwoFactorPassword("");
		setTwoFactorCode("");
		setStatus({ tone: "success", message: "Two-factor authentication is enabled." });
	}

	function requestDisableTwoFactor(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setConfirmationAction({ type: "disable-two-factor" });
	}

	async function disableTwoFactor() {
		setStatus(null);
		setBusy(true);
		const result = await authClient.twoFactor.disable({
			password: twoFactorPassword,
		});
		setBusy(false);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not disable 2FA." });
			return;
		}
		if (user) {
			setTwoFactorEnabledOverride({ userId: user.id, enabled: false });
		}
		setTwoFactorSetup(null);
		setTwoFactorPassword("");
		setTwoFactorCode("");
		setBackupCodes([]);
		setStatus({ tone: "success", message: "Two-factor authentication is disabled." });
	}

	async function confirmSecurityAction() {
		if (!confirmationAction) return;
		if (confirmationAction.type === "delete-passkey") {
			await deletePasskey(confirmationAction.passkeyId);
		}
		if (confirmationAction.type === "unlink-provider") {
			await unlinkProvider(confirmationAction.account);
		}
		if (confirmationAction.type === "disable-two-factor") {
			await disableTwoFactor();
		}
		setConfirmationAction(null);
	}

	async function generateBackupCodes(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus(null);
		setBusy(true);
		const result = await authClient.twoFactor.generateBackupCodes({
			password: backupPassword,
		});
		setBusy(false);
		if (result.error) {
			setStatus({
				tone: "error",
				message: result.error.message ?? "Could not generate backup codes.",
			});
			return;
		}
		const data = result.data as { backupCodes?: string[] } | null;
		setBackupCodes(data?.backupCodes ?? []);
		setBackupPassword("");
		setStatus({ tone: "success", message: "New backup codes generated." });
	}

	async function copyBackupCodes() {
		const result = await copyTextToClipboard(backupCodes.join("\n"));
		if (!result.ok) {
			setBackupCopied(false);
			setStatus({ tone: "error", message: result.message });
			return;
		}
		setStatus(null);
		setBackupCopied(true);
		setTimeout(() => setBackupCopied(false), 1500);
	}

	async function sendPhoneCode(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const formData = new FormData(event.currentTarget);
		const nextPhoneNumber = String(formData.get("phoneNumber") ?? "").trim();
		setStatus(null);
		setBusy(true);
		const result = await authClient.phoneNumber.sendOtp({ phoneNumber: nextPhoneNumber });
		setBusy(false);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not send code." });
			return;
		}
		setPendingPhoneNumber(nextPhoneNumber);
		setPhoneCodeSent(true);
		setStatus({ tone: "success", message: "Phone verification code requested." });
	}

	async function verifyPhoneNumber(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus(null);
		setBusy(true);
		const result = await authClient.phoneNumber.verify({
			phoneNumber: pendingPhoneNumber,
			code: normalizeTwoFactorVerificationCode("otp", phoneCode),
			updatePhoneNumber: true,
		});
		setBusy(false);
		setStatus(
			result.error
				? { tone: "error", message: result.error.message ?? "Could not verify phone number." }
				: { tone: "success", message: "Phone number verified." },
		);
		if (!result.error) {
			setPhoneSheetOpen(false);
			setPhoneCode("");
			setPhoneCodeSent(false);
		}
	}

	async function removePhoneNumber() {
		setStatus(null);
		setBusy(true);
		const result = await authClient.updateUser({ phoneNumber: null });
		setBusy(false);
		setPhoneCode("");
		setPhoneCodeSent(false);
		setStatus(
			result.error
				? { tone: "error", message: result.error.message ?? "Could not remove phone number." }
				: { tone: "success", message: "Phone number removed." },
		);
		if (!result.error) setPhoneSheetOpen(false);
	}

	async function changePassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		const formData = new FormData(form);
		const currentPassword = String(formData.get("currentPassword") ?? "");
		const confirmationError = getPasswordConfirmationError(newPassword, confirmPassword);
		if (confirmationError) {
			setStatus({ tone: "error", message: confirmationError });
			return;
		}

		setStatus(null);
		setBusy(true);
		const response = await fetch("/api/account/password", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				...(hasCredentialAccount ? { currentPassword } : {}),
				newPassword,
			}),
		});
		const payload = (await response.json().catch(() => null)) as { error?: string } | null;
		setBusy(false);
		if (!response.ok) {
			setStatus({
				tone: "error",
				message: payload?.error ?? "Could not update password.",
			});
			return;
		}
		setStatus({
			tone: "success",
			message: hasCredentialAccount ? "Password changed." : "Password set.",
		});
		if (response.ok) {
			form.reset();
			setNewPassword("");
			setConfirmPassword("");
			setPasswordSheetOpen(false);
			void loadCredentials();
		}
	}

	async function deleteAccount() {
		setDeleteSheetOpen(false);
		setStatus(null);
		setBusy(true);
		const result = await authClient.deleteUser({
			password: deletePassword || undefined,
			callbackURL: "/sign-in?deleted=1",
		});
		setBusy(false);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Could not delete account." });
			return;
		}
		window.location.assign("/sign-in?deleted=1");
	}

	async function resendVerification() {
		if (!user) return;
		setStatus(null);
		setBusy(true);
		const result = await authClient.sendVerificationEmail({
			email: user.email,
			callbackURL: "/account?verified=1",
		});
		setBusy(false);
		setStatus(
			result?.error
				? { tone: "error", message: result.error.message ?? "Could not send the email." }
				: { tone: "success", message: "Verification email sent." },
		);
	}

	return (
		<DashboardShell
			user={user}
			title="Security"
			description="Control how you sign in and protect access to your account."
			sections={SECTIONS}
		>
			<StatusBanner status={queryStatus} />

			{user && session ? (
				<>
					<section id="passkeys" className="scroll-mt-32">
						<form onSubmit={addPasskey}>
							<SettingsCard
								title="Passkeys"
								description="Add a named passkey for phishing-resistant, passwordless sign-in on this device."
								footer={
									<SettingsCardFooter hint="Stored securely on your device.">
										<Button variant="outline" size="sm" type="submit" disabled={busy}>
											<KeyRound className="size-4" />
											Add passkey
										</Button>
									</SettingsCardFooter>
								}
								>
									<div className="space-y-4">
										<Field label="Passkey name">
											<FieldInput
												autoComplete="off"
												value={passkeyName}
												onChange={(event) => setPasskeyName(event.target.value)}
											/>
										</Field>
											<div className="overflow-hidden rounded-lg border">
												{!credentialsLoaded ? (
													<div className="divide-y">
														{[0, 1].map((index) => (
															<div key={index} className="flex items-center gap-3 px-3 py-2.5">
																<Skeleton className="size-4 shrink-0 rounded-full" />
																<div className="min-w-0 flex-1 space-y-1.5">
																	<Skeleton className="h-3.5 w-32" />
																	<Skeleton className="h-3 w-48 max-w-full" />
																</div>
																<Skeleton className="h-8 w-20 rounded-lg" />
															</div>
														))}
													</div>
												) : passkeys.length ? (
													<ul className="divide-y">
														{passkeys.map((passkey) => (
															<li key={passkey.id} className="flex items-center gap-3 px-3 py-2.5">
															<KeyRound className="size-4 shrink-0 text-muted-foreground" />
															<div className="min-w-0 flex-1">
																<div className="truncate text-sm font-medium">
																	{passkey.name || "Passkey"}
																</div>
																<div className="truncate text-xs tabular-nums text-muted-foreground">
																	{[
																		passkey.deviceType,
																		passkey.backedUp ? "Backed up" : "Single device",
																		passkey.createdAt
																			? `Added ${new Date(passkey.createdAt).toLocaleDateString()}`
																			: null,
																	]
																		.filter(Boolean)
																		.join(" · ")}
																</div>
															</div>
															<Button
																type="button"
																variant="ghost"
																size="sm"
																className="shrink-0 text-muted-foreground hover:text-destructive"
																onClick={() =>
																	setConfirmationAction({
																		type: "delete-passkey",
																		passkeyId: passkey.id,
																	})
																}
																disabled={busy}
															>
																Remove
															</Button>
														</li>
													))}
													</ul>
												) : (
													<p className="px-3 py-6 text-center text-sm text-muted-foreground">
														No passkeys registered.
													</p>
												)}
										</div>
									</div>
								</SettingsCard>
							</form>
						</section>

						<section id="two-factor" className="scroll-mt-32">
							<SettingsCard
								title={
									<TitleWithPill
										text="Two-factor authentication"
										tone={twoFactorEnabled ? "active" : "idle"}
										label={twoFactorEnabled ? "On" : "Off"}
									/>
								}
								description="Require a time-based code from an authenticator app when you sign in with your password."
								footer={
									<SettingsCardFooter
										hint={
											twoFactorEnabled
												? "Trusted devices skip prompts for the configured trust window."
												: "2FA turns on after your first authenticator code verifies."
										}
									>
										<Button
											variant={twoFactorEnabled ? "outline" : "default"}
											size="sm"
											onClick={() => setTwoFactorSheetOpen(true)}
										>
											<ShieldCheck className="size-4" />
											{twoFactorEnabled ? "Manage" : "Enable 2FA"}
										</Button>
									</SettingsCardFooter>
								}
							>
								<SummaryRow
									icon={
										twoFactorEnabled ? (
											<ShieldCheck className="size-[1.15rem]" />
										) : (
											<ShieldOff className="size-[1.15rem]" />
										)
									}
									title={twoFactorEnabled ? "Authenticator app is active" : "Two-factor is off"}
									subtitle={
										twoFactorEnabled
											? "A code is required for password sign-ins."
											: "Add a second step to protect password sign-ins."
									}
								/>
							</SettingsCard>

							<Sheet open={twoFactorSheetOpen} onOpenChange={setTwoFactorSheetOpen}>
								<SheetContent>
									<SheetHeader>
										<SheetTitle>Two-factor authentication</SheetTitle>
										<SheetDescription>
											{twoFactorEnabled
												? "Manage your authenticator app and backup codes."
												: "Protect password sign-ins with a time-based code from an authenticator app."}
										</SheetDescription>
									</SheetHeader>
									<SheetBody className="space-y-5">
										{!twoFactorEnabled && !twoFactorSetup ? (
											<form className="space-y-3" onSubmit={enableTwoFactor}>
												<Field
													label="Confirm your password"
													hint="Passwordless accounts can leave this empty."
												>
													<FieldPasswordInput
														autoComplete="current-password"
														value={twoFactorPassword}
														onChange={(event) => setTwoFactorPassword(event.target.value)}
														placeholder="Current password"
													/>
												</Field>
												<Button type="submit" className="w-full" disabled={busy}>
													<ShieldCheck className="size-4" />
													Enable 2FA
												</Button>
											</form>
										) : null}

										{twoFactorSetup ? (
											<div className="space-y-4 rounded-lg border bg-muted/20 p-4">
												<Step number={1} icon={QrCode} title="Scan the QR code">
													<div className="space-y-3">
														<div className="mx-auto grid w-fit place-items-center rounded-lg bg-white p-3">
															<QRCode value={twoFactorSetup.totpURI} size={148} />
														</div>
														<p className="text-xs text-muted-foreground">
															Scan this in your authenticator app, or paste the setup key
															manually.
														</p>
														<code className="block truncate rounded-md border bg-background px-2.5 py-2 font-mono text-xs">
															{twoFactorSetup.totpURI}
														</code>
													</div>
												</Step>
												<div className="border-t" />
												<Step number={2} icon={ShieldCheck} title="Enter the code it shows">
													<form className="space-y-3" onSubmit={verifyTwoFactor}>
														<OTPInput
															value={twoFactorCode}
															onChange={setTwoFactorCode}
															disabled={busy}
															aria-label="Authenticator code"
														/>
														<Button
															size="sm"
															type="submit"
															disabled={busy || twoFactorCode.length !== 6}
														>
															<Check className="size-4" />
															Verify and turn on
														</Button>
													</form>
												</Step>
											</div>
										) : null}

										{backupCodes.length ? (
											<div className="space-y-3 rounded-lg border bg-muted/20 p-4">
												<div className="flex flex-wrap items-center justify-between gap-3">
													<div>
														<div className="flex items-center gap-1.5 text-sm font-medium">
															<KeyRound className="size-4 text-muted-foreground" />
															Save your backup codes
														</div>
														<p className="text-xs text-muted-foreground">
															Store these now — each code works once if you lose your device.
														</p>
													</div>
													<Button
														variant="outline"
														size="sm"
														type="button"
														onClick={copyBackupCodes}
													>
														{backupCopied ? (
															<Check className="size-4" />
														) : (
															<Copy className="size-4" />
														)}
														{backupCopied ? "Copied" : "Copy all"}
													</Button>
												</div>
												<div className="grid gap-2 sm:grid-cols-2">
													{backupCodes.map((code) => (
														<code
															key={code}
															className="rounded-md border bg-background px-2.5 py-2 text-center font-mono text-xs tracking-wider"
														>
															{code}
														</code>
													))}
												</div>
											</div>
										) : null}

										{twoFactorEnabled ? (
											<div className="space-y-5">
												<form className="space-y-2.5" onSubmit={generateBackupCodes}>
													<Field
														label="Regenerate backup codes"
														hint="Invalidates all previous codes."
													>
														<FieldPasswordInput
															autoComplete="current-password"
															value={backupPassword}
															onChange={(event) => setBackupPassword(event.target.value)}
															placeholder="Current password"
														/>
													</Field>
													<Button variant="outline" size="sm" type="submit" disabled={busy}>
														<KeyRound className="size-4" />
														Regenerate codes
													</Button>
												</form>
												<form
													className="space-y-2.5 border-t pt-5"
													onSubmit={requestDisableTwoFactor}
												>
													<Field
														label="Turn off two-factor"
														hint="Removes the second step from sign-in."
													>
														<FieldPasswordInput
															autoComplete="current-password"
															value={twoFactorPassword}
															onChange={(event) => setTwoFactorPassword(event.target.value)}
															placeholder="Current password"
														/>
													</Field>
													<Button variant="destructive" size="sm" type="submit" disabled={busy}>
														<ShieldOff className="size-4" />
														Disable 2FA
													</Button>
												</form>
											</div>
										) : null}
									</SheetBody>
								</SheetContent>
							</Sheet>
						</section>

						<section id="accounts" className="scroll-mt-32">
							<SettingsCard
								title="Connected Accounts"
								description="Social providers linked to this Passport account."
								footer={<SettingsCardFooter hint="Better Auth prevents unlinking the last sign-in method." />}
							>
								<ul className="divide-y rounded-lg border">
									{SOCIAL_PROVIDERS.map((provider) => {
										const account = accounts.find((item) => item.providerId === provider.id);
										return (
											<li key={provider.id} className="flex items-center gap-3 px-3 py-2.5">
												<span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background">
													<PublicIcon src={provider.icon} className="size-4" />
												</span>
												<div className="min-w-0 flex-1">
													<div className="text-sm font-medium">{provider.label}</div>
													<div className="truncate text-xs text-muted-foreground">
														{account ? `Connected as ${account.accountId}` : "Not connected"}
													</div>
												</div>
												{account ? (
													<Button
														variant="outline"
														size="sm"
														onClick={() =>
															setConfirmationAction({
																type: "unlink-provider",
																account,
															})
														}
														disabled={busy}
													>
														<Unlink className="size-4" />
														Unlink
													</Button>
												) : (
													<Button
														variant="outline"
														size="sm"
														onClick={() => linkProvider(provider.id)}
														disabled={busy}
													>
														Link
													</Button>
												)}
											</li>
										);
									})}
								</ul>
									{credentialsLoaded ? null : <Skeleton className="mt-3 h-3 w-40" />}
								</SettingsCard>
							</section>

			<section id="email" className="scroll-mt-32">
				<SettingsCard
					title="Email verification"
					description={
						user.emailVerified
							? `${user.email} is verified.`
							: `${user.email} is not verified yet.`
					}
					footer={
						<SettingsCardFooter
							hint={user.emailVerified ? "No action needed." : "Confirm you own this address."}
						>
							{user.emailVerified ? null : (
								<Button variant="outline" size="sm" onClick={resendVerification} disabled={busy}>
									<MailCheck className="size-4" />
									Resend email
								</Button>
							)}
						</SettingsCardFooter>
					}
				/>
			</section>

			<section id="phone" className="scroll-mt-32">
				<SettingsCard
					title={
						<TitleWithPill
							text="Phone number"
							tone={user.phoneNumberVerified ? "active" : "idle"}
							label={user.phoneNumberVerified ? "Verified" : "None"}
						/>
					}
					description="Add a phone number to receive verification codes by SMS."
					footer={
						<SettingsCardFooter
							hint={
								user.phoneNumberVerified
									? "A verified number is on file."
									: "Verification uses a one-time code over SMS."
							}
						>
							<Button variant="outline" size="sm" onClick={() => setPhoneSheetOpen(true)}>
								<Smartphone className="size-4" />
								{user.phoneNumberVerified ? "Manage" : "Add phone"}
							</Button>
						</SettingsCardFooter>
					}
				>
					<SummaryRow
						icon={<Smartphone className="size-[1.15rem]" />}
						title={
							user.phoneNumberVerified && user.phoneNumber ? (
								<span className="flex items-center gap-2">
									<StatusDot tone="active" />
									{user.phoneNumber}
								</span>
							) : (
								"No phone number"
							)
						}
						subtitle={
							user.phoneNumberVerified
								? "Verified and ready for SMS codes."
								: "Add one to receive codes over SMS."
						}
					/>
				</SettingsCard>

				<Sheet open={phoneSheetOpen} onOpenChange={setPhoneSheetOpen}>
					<SheetContent>
						<SheetHeader>
							<SheetTitle>Phone number</SheetTitle>
							<SheetDescription>
								Receive verification codes by SMS on a trusted number.
							</SheetDescription>
						</SheetHeader>
						<SheetBody className="space-y-5">
							{user.phoneNumberVerified && user.phoneNumber ? (
								<div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3.5 py-3">
									<span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
										<Smartphone className="size-[1.15rem]" />
									</span>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2 text-sm font-medium">
											<StatusDot tone="active" />
											{user.phoneNumber}
										</div>
										<p className="text-xs text-muted-foreground">Verified for SMS codes.</p>
									</div>
									<Button variant="outline" size="sm" onClick={removePhoneNumber} disabled={busy}>
										<Phone className="size-4" />
										Remove
									</Button>
								</div>
							) : (
								<div className="space-y-4 rounded-lg border bg-muted/20 p-4">
									<Step number={1} icon={Smartphone} title="Enter your number">
										<form className="space-y-3" onSubmit={sendPhoneCode}>
											<Field label="Phone number">
												<FieldInput
													name="phoneNumber"
													type="tel"
													autoComplete="tel"
														placeholder="+15550000000"
													defaultValue={user.phoneNumber ?? ""}
													required
												/>
											</Field>
											<Button variant="outline" size="sm" type="submit" disabled={busy}>
												<PhoneCall className="size-4" />
												{phoneCodeSent ? "Resend code" : "Send code"}
											</Button>
										</form>
									</Step>
									<div className="border-t" />
									<Step number={2} icon={ShieldCheck} title="Enter the SMS code">
										{phoneCodeSent ? (
											<form className="space-y-3" onSubmit={verifyPhoneNumber}>
												<p className="text-xs text-muted-foreground">
													Sent to{" "}
													<span className="font-medium text-foreground">{pendingPhoneNumber}</span>.
												</p>
												<OTPInput
													value={phoneCode}
													onChange={setPhoneCode}
													disabled={busy}
													aria-label="SMS verification code"
												/>
												<Button size="sm" type="submit" disabled={busy || phoneCode.length !== 6}>
													<Check className="size-4" />
													Verify number
												</Button>
											</form>
										) : (
											<p className="text-xs text-muted-foreground">
												Request a code above and we'll send it to your phone.
											</p>
										)}
									</Step>
								</div>
							)}
						</SheetBody>
					</SheetContent>
				</Sheet>
			</section>

			<section id="password" className="scroll-mt-32">
				<SettingsCard
					title="Password"
					description={
						hasCredentialAccount
							? "Change the password used for credential sign-in."
							: "Add a password so this account can also sign in with credentials."
					}
					footer={
						<SettingsCardFooter hint="Other sessions are signed out after a password change.">
							<Button variant="outline" size="sm" onClick={() => setPasswordSheetOpen(true)}>
								<LockKeyhole className="size-4" />
								{hasCredentialAccount ? "Change password" : "Set password"}
							</Button>
						</SettingsCardFooter>
					}
					>
						<SummaryRow
							icon={<LockKeyhole className="size-[1.15rem]" />}
							title={
								credentialsLoaded ? (
									hasCredentialAccount ? (
										"Password is set"
									) : (
										"No password set"
									)
								) : (
									<Skeleton className="h-3.5 w-36" />
								)
							}
							subtitle={
								credentialsLoaded ? (
									hasCredentialAccount ? (
										"Used together with any second factor at sign-in."
									) : (
										"Social and passwordless sign-in still work."
									)
								) : (
									<Skeleton className="h-3 w-52 max-w-full" />
								)
							}
						/>
					</SettingsCard>

				<Sheet open={passwordSheetOpen} onOpenChange={setPasswordSheetOpen}>
					<SheetContent>
						<form onSubmit={changePassword} className="flex min-h-0 flex-1 flex-col">
							<SheetHeader>
								<SheetTitle>{hasCredentialAccount ? "Change password" : "Set password"}</SheetTitle>
								<SheetDescription>
									{hasCredentialAccount
										? "Other active sessions are signed out after a successful change."
										: "Create the first credential password for this account."}
								</SheetDescription>
							</SheetHeader>
							<SheetBody className="space-y-5">
								{hasCredentialAccount ? (
									<Field label="Current password">
										<FieldPasswordInput
											name="currentPassword"
											autoComplete="current-password"
											required
										/>
									</Field>
								) : null}
								<div className="space-y-4 border-t pt-5">
									<Field label="New password">
										<FieldPasswordInput
											name="newPassword"
											autoComplete="new-password"
											value={newPassword}
											onChange={(event) => setNewPassword(event.target.value)}
											required
										/>
									</Field>
									<Field
										label="Confirm new password"
										error={
											confirmPassword
												? (getPasswordConfirmationError(newPassword, confirmPassword) ?? undefined)
												: undefined
										}
									>
										<FieldPasswordInput
											name="confirmPassword"
											autoComplete="new-password"
											value={confirmPassword}
											onChange={(event) => setConfirmPassword(event.target.value)}
											required
										/>
									</Field>
									<PasswordStrength value={newPassword} />
								</div>
							</SheetBody>
							<SheetFooter>
								<SheetClose asChild>
									<Button variant="outline" type="button">
										Cancel
									</Button>
								</SheetClose>
								<Button
									type="submit"
									disabled={
										busy ||
										!isPasswordConfirmationReady(newPassword, confirmPassword)
									}
								>
									<LockKeyhole className="size-4" />
									{hasCredentialAccount ? "Change password" : "Set password"}
								</Button>
							</SheetFooter>
						</form>
					</SheetContent>
				</Sheet>
			</section>

			<section id="session" className="scroll-mt-32">
				<SettingsCard
					title="Session"
					description={
						<>
							This browser session expires{" "}
							<span className="tabular-nums">
								{new Date(session.session.expiresAt).toLocaleString()}
							</span>
							.
						</>
					}
					footer={
						<SettingsCardFooter hint="Sign out everywhere this session is active.">
							<Button
								variant="destructive"
								size="sm"
								onClick={() => setSignOutDialogOpen(true)}
								disabled={busy}
							>
								<LogOut className="size-4" />
								Sign out
							</Button>
						</SettingsCardFooter>
					}
				/>
					</section>

					<section id="activity" className="scroll-mt-32">
						<AccountActivitySection userId={session.user.id} />
					</section>

					<section id="danger" className="scroll-mt-32">
						<SettingsCard
							title="Delete account"
							description="Permanently delete this Passport account and all of its data."
							className="border-destructive/30"
							footer={
								<SettingsCardFooter hint="Email verification may be required for some accounts.">
									<Button
										variant="destructive"
										size="sm"
										onClick={() => setDeleteSheetOpen(true)}
										disabled={busy}
									>
										<Trash2 className="size-4" />
										Delete account
									</Button>
								</SettingsCardFooter>
							}
						>
							<SummaryRow
								icon={<Trash2 className="size-[1.15rem] text-destructive" />}
								title="This action is irreversible"
								subtitle="Your account, sessions, and connected apps are removed."
							/>
						</SettingsCard>

						<Sheet open={deleteSheetOpen} onOpenChange={setDeleteSheetOpen}>
							<SheetContent>
								<form
									onSubmit={(event) => {
										event.preventDefault();
										void deleteAccount();
									}}
									className="flex min-h-0 flex-1 flex-col"
								>
									<SheetHeader>
										<SheetTitle>Delete account</SheetTitle>
										<SheetDescription>
											This permanently deletes your Passport account. This cannot be undone.
										</SheetDescription>
									</SheetHeader>
									<SheetBody className="space-y-5">
										<div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">
											Deleting your account removes your profile, sessions, passkeys, and every
											application you've authorized.
										</div>
										<Field label="Confirm your password">
											<FieldPasswordInput
												name="deletePassword"
												autoComplete="current-password"
												placeholder="Required for password accounts"
												value={deletePassword}
												onChange={(event) => setDeletePassword(event.target.value)}
											/>
										</Field>
									</SheetBody>
									<SheetFooter>
										<SheetClose asChild>
											<Button variant="outline" type="button">
												Cancel
											</Button>
										</SheetClose>
										<Button variant="destructive" type="submit" disabled={busy}>
											<Trash2 className="size-4" />
											Permanently delete
										</Button>
									</SheetFooter>
								</form>
							</SheetContent>
						</Sheet>
					</section>
					<SecurityConfirmationDialog
						action={confirmationAction}
						busy={busy}
						onCancel={() => setConfirmationAction(null)}
						onConfirm={() => void confirmSecurityAction()}
					/>
					<SignOutDialog open={signOutDialogOpen} onOpenChange={setSignOutDialogOpen} />
				</>
			) : null}
		</DashboardShell>
	);
}

type SecurityConfirmationCopy = {
	title: string;
	description: string;
	confirmLabel: string;
	Icon: React.ComponentType<{ className?: string }>;
};

/**
 * Confirmation dialog for destructive security mutations. The caller supplies
 * the pending action and owns the mutation; this component keeps native browser
 * confirmations out of the page while sharing the app's Dialog styling.
 */
export function SecurityConfirmationDialog({
	action,
	busy,
	onCancel,
	onConfirm,
}: {
	action: SecurityConfirmationAction | null;
	busy: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const copy = action ? securityConfirmationCopy(action) : null;
	const Icon = copy?.Icon;

	return (
		<Dialog open={Boolean(action)} onOpenChange={(open) => !open && onCancel()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{copy?.title}</DialogTitle>
					<DialogDescription>{copy?.description}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" type="button" onClick={onCancel}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						type="button"
						onClick={onConfirm}
						disabled={!action || busy}
					>
						{Icon ? <Icon className="size-4" /> : null}
						{copy?.confirmLabel ?? "Confirm"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function securityConfirmationCopy(action: SecurityConfirmationAction): SecurityConfirmationCopy {
	if (action.type === "delete-passkey") {
		return {
			title: "Remove passkey?",
			description:
				"This removes the passkey from your account. You can add it again from this device later.",
			confirmLabel: "Remove passkey",
			Icon: Trash2,
		};
	}
	if (action.type === "unlink-provider") {
		return {
			title: "Unlink account?",
			description: `Unlink ${providerLabel(action.account.providerId)} from this Passport account. You can reconnect it later.`,
			confirmLabel: "Unlink account",
			Icon: Unlink,
		};
	}
	return {
		title: "Disable 2FA?",
		description: "Password sign-ins will no longer require an authenticator code.",
		confirmLabel: "Disable 2FA",
		Icon: ShieldOff,
	};
}

function providerLabel(providerId: string) {
	return SOCIAL_PROVIDERS.find((provider) => provider.id === providerId)?.label ?? providerId;
}

/** Card title paired with a small status pill (dot + label). */
function TitleWithPill({ text, tone, label }: { text: string; tone: DotTone; label: string }) {
	return (
		<span className="flex items-center gap-2.5">
			{text}
			<span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
				<StatusDot tone={tone} />
				{label}
			</span>
		</span>
	);
}

/** Numbered setup step with an icon-labelled heading and a body slot. */
function Step({
	number,
	icon: Icon,
	title,
	children,
}: {
	number: number;
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="flex gap-3">
			<span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">
				{number}
			</span>
			<div className="min-w-0 flex-1 space-y-2.5">
				<div className="flex items-center gap-1.5 text-sm font-medium">
					<Icon className="size-4 text-muted-foreground" />
					{title}
				</div>
				{children}
			</div>
		</div>
	);
}
