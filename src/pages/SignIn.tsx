import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Fingerprint, Mail } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Field, FieldInput } from "@/components/auth/field";
import { SocialButtons, type SocialProviderId } from "@/components/auth/social-buttons";
import { StatusBanner, type Status } from "@/components/auth/status";
import { BrandMark } from "@/components/auth/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/auth-client";
import { useBrand } from "@/lib/brand-runtime";
import { withViewTransition } from "@/lib/view-transition";

type Mode = "signin" | "signup";

function copyFor(mode: Mode, brandName: string) {
	return {
		signin: {
			title: `Sign in to ${brandName}`,
			action: "Sign in",
			toggle: "Don't have an account?",
			switchTo: "Create one",
		},
		signup: {
			title: `Create your ${brandName} account`,
			action: "Create account",
			toggle: "Already have an account?",
			switchTo: "Sign in",
		},
	}[mode];
}

export function SignIn() {
	const brand = useBrand();
	const searchParams = new URLSearchParams(window.location.search);
	const formRef = useRef<HTMLFormElement>(null);
	const [mode, setMode] = useState<Mode>("signin");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [username, setUsername] = useState("");
	const [fieldError, setFieldError] = useState<string | null>(null);
	const [status, setStatus] = useState<Status | null>(() => {
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

	const callbackURL = searchParams.get("callbackURL") ?? "/account";
	const verificationCallbackURL = "/account?verified=1";
	const copy = copyFor(mode, brand.name);

	function toggleMode() {
		setFieldError(null);
		withViewTransition(() => setMode((prev) => (prev === "signin" ? "signup" : "signin")));
	}

	async function submitPassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setLoading(true);
		setFieldError(null);
		setStatus(null);

		const result =
			mode === "signin"
				? await authClient.signIn.email({ email, password, callbackURL })
				: await authClient.signUp.email({
						email,
						password,
						name: name || email,
						username: username || undefined,
						callbackURL: verificationCallbackURL,
					});

		setLoading(false);

		if (result.error) {
			setFieldError(result.error.message ?? "Authentication failed.");
			return;
		}

		if (mode === "signin") {
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
		if (!email) {
			setFieldError("Enter your email to receive a magic link.");
			return;
		}
		setLoading(true);
		setFieldError(null);
		setStatus(null);
		const result = await authClient.signIn.magicLink({ email, callbackURL });
		setLoading(false);
		setStatus(
			result.error
				? { tone: "error", message: result.error.message ?? "Could not send magic link." }
				: { tone: "success", message: "Magic link sent. Check your email." },
		);
	}

	async function signInWithPasskey() {
		setLoading(true);
		setFieldError(null);
		const result = await authClient.signIn.passkey();
		setLoading(false);
		if (result.error) {
			setStatus({ tone: "error", message: result.error.message ?? "Passkey sign-in failed." });
			return;
		}
		window.location.assign(callbackURL);
	}

	async function social(provider: SocialProviderId) {
		await authClient.signIn.social({ provider, callbackURL });
	}

	return (
		<AuthShell>
			<div className="flex flex-col items-center gap-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<BrandMark className="size-10 rounded-lg" />
					<h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
				</div>

				<Card className="w-full">
					<CardContent className="space-y-4">
						<StatusBanner status={status} />

						<form
							ref={formRef}
							className="space-y-3.5"
							onSubmit={submitPassword}
							onKeyDown={handleShortcut}
						>
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
							<Field label="Email" error={fieldError ?? undefined}>
								<FieldInput
									type="email"
									autoComplete="email"
									placeholder="you@example.com"
									autoFocus
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									required
								/>
							</Field>
							<Field label="Password">
								<FieldInput
									type="password"
									autoComplete={mode === "signin" ? "current-password" : "new-password"}
									placeholder="••••••••"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									required
								/>
							</Field>
							<Button
								className="mt-1 w-full"
								size="lg"
								type="submit"
								disabled={loading}
								aria-keyshortcuts="Meta+Enter Control+Enter"
							>
								{copy.action}
								<Kbd className="ml-auto border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground/70">
									⌘↵
								</Kbd>
							</Button>
						</form>

						<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-0.5 text-xs text-muted-foreground">
							<Separator />
							<span>or</span>
							<Separator />
						</div>

						<div className="grid grid-cols-2 gap-2">
							<Button variant="outline" type="button" onClick={signInWithPasskey} disabled={loading}>
								<Fingerprint className="size-4" />
								Passkey
							</Button>
							<Button variant="outline" type="button" onClick={sendMagicLink} disabled={loading}>
								<Mail className="size-4" />
								Magic link
							</Button>
						</div>

						<SocialButtons onSelect={social} disabled={loading} />
					</CardContent>
				</Card>

				<p className="text-sm text-muted-foreground">
					{copy.toggle}{" "}
					<Button
						variant="link"
						className="h-auto p-0 text-sm font-medium text-foreground"
						onClick={toggleMode}
					>
						{copy.switchTo}
					</Button>
				</p>
			</div>
		</AuthShell>
	);
}
