import { useState, type ChangeEvent, type FormEvent } from "react";
import { Check, Copy, CreditCard, MailPlus, Save, Upload } from "lucide-react";

import { authClient } from "@/auth-client";
import { DashboardShell } from "@/components/auth/dashboard-shell";
import { Field, FieldInput } from "@/components/auth/field";
import { type Section } from "@/components/auth/section-nav";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initialsOf, useRequireSession } from "@/lib/session";

const SECTIONS: Section[] = [
	{ id: "profile", label: "Profile" },
	{ id: "email", label: "Email" },
	{ id: "picture", label: "Picture" },
	{ id: "billing", label: "Billing" },
	{ id: "user-id", label: "User ID" },
];

type AccountUser = {
	id: string;
	name?: string | null;
	email: string;
	emailVerified?: boolean | null;
	image?: string | null;
	username?: string | null;
	displayUsername?: string | null;
};

type ProfileImageUploadResponse = {
	image: string;
};

export function Account() {
	const { data: session } = useRequireSession();
	const [copied, setCopied] = useState(false);
	const [status, setStatus] = useState<Status | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [newEmail, setNewEmail] = useState("");
	const [imageURL, setImageURL] = useState<string | null>(null);
	const [imageFile, setImageFile] = useState<File | null>(null);
	const user = session?.user as AccountUser | undefined;

	async function copyId(id: string) {
		await navigator.clipboard.writeText(id);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	async function updateProfile(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const formData = new FormData(event.currentTarget);
		const nextName = String(formData.get("name") ?? "").trim();
		const nextUsername = String(formData.get("username") ?? "").trim();
		setStatus(null);
		setBusy("profile");
		const result = await authClient.updateUser({
			name: nextName || user?.email,
			username: nextUsername || undefined,
		});
		setBusy(null);
		setStatus(
			result.error
				? { tone: "error", message: result.error.message ?? "Could not update profile." }
				: { tone: "success", message: "Profile updated." },
		);
	}

	async function changeEmail(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus(null);
		setBusy("email");
		const result = await authClient.changeEmail({
			newEmail,
			callbackURL: "/account?emailChanged=1",
		});
		setBusy(null);
		setStatus(
			result.error
				? { tone: "error", message: result.error.message ?? "Could not start email change." }
				: { tone: "success", message: "Check your new email to confirm the change." },
		);
	}

	function selectImage(event: ChangeEvent<HTMLInputElement>) {
		setImageFile(event.target.files?.[0] ?? null);
	}

	async function uploadProfileImage(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!imageFile) {
			setStatus({ tone: "error", message: "Choose a profile picture first." });
			return;
		}

		setStatus(null);
		setBusy("picture");
		const formData = new FormData();
		formData.set("image", imageFile);
		const uploadResponse = await fetch("/api/profile-images", {
			method: "POST",
			body: formData,
		});
		if (!uploadResponse.ok) {
			const payload = (await uploadResponse.json()) as { error?: string };
			setBusy(null);
			setStatus({
				tone: "error",
				message: payload.error ?? "Could not upload profile picture.",
			});
			return;
		}

		const payload = (await uploadResponse.json()) as ProfileImageUploadResponse;
		const result = await authClient.updateUser({ image: payload.image });
		setBusy(null);
		if (result.error) {
			setStatus({
				tone: "error",
				message: result.error.message ?? "Could not save profile picture.",
			});
			return;
		}
		setImageURL(payload.image);
		setStatus({ tone: "success", message: "Profile picture updated." });
	}

	function saveBilling(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus({ tone: "success", message: "Billing info left unchanged." });
	}

	return (
		<DashboardShell
			user={user}
			title="Account"
			description="Manage the identity shared with every application connected to Passport."
			sections={SECTIONS}
		>
			<StatusBanner status={status} />

			{user ? (
				<>
					<section id="profile" className="scroll-mt-32">
						<form onSubmit={updateProfile}>
							<SettingsCard
								title="Profile"
								description="Your name and username as connected applications see them."
								footer={
									<SettingsCardFooter hint="Updates use Better Auth user metadata.">
										<Button size="sm" type="submit" disabled={busy === "profile"}>
											<Save className="size-4" />
											Save
										</Button>
									</SettingsCardFooter>
								}
							>
								<div className="grid gap-4 sm:grid-cols-2">
									<Field label="Name">
										<FieldInput
											name="name"
											autoComplete="name"
											defaultValue={user.name ?? ""}
										/>
									</Field>
									<Field label="Username">
										<FieldInput
											name="username"
											autoComplete="username"
											placeholder="ada"
											defaultValue={user.displayUsername ?? user.username ?? ""}
										/>
									</Field>
								</div>
							</SettingsCard>
						</form>
					</section>

					<section id="email" className="scroll-mt-32">
						<form onSubmit={changeEmail}>
							<SettingsCard
								title="Email"
								description="Change the email address used for sign-in and verification."
								footer={
									<SettingsCardFooter
										hint={user.emailVerified ? "Current email verified." : "Current email unverified."}
									>
										<Button size="sm" type="submit" disabled={busy === "email" || !newEmail}>
											<MailPlus className="size-4" />
											Change email
										</Button>
									</SettingsCardFooter>
								}
							>
								<div className="space-y-4">
									<div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
										<div className="min-w-0">
											<div className="truncate text-sm font-medium">{user.email}</div>
											<div className="text-xs text-muted-foreground">Current email</div>
										</div>
										<Badge variant={user.emailVerified ? "default" : "secondary"}>
											{user.emailVerified ? "Verified" : "Unverified"}
										</Badge>
									</div>
									<Field label="New email">
										<FieldInput
											type="email"
											autoComplete="email"
											placeholder="you@example.com"
											value={newEmail}
											onChange={(event) => setNewEmail(event.target.value)}
										/>
									</Field>
								</div>
							</SettingsCard>
						</form>
					</section>

					<section id="picture" className="scroll-mt-32">
						<form onSubmit={uploadProfileImage}>
							<SettingsCard
								title="Profile Picture"
								description="Upload an image stored in the configured R2 bucket."
								footer={
									<SettingsCardFooter hint="PNG, JPG, GIF, or WebP up to 2 MB.">
										<Button size="sm" type="submit" disabled={busy === "picture" || !imageFile}>
											<Upload className="size-4" />
											Upload
										</Button>
									</SettingsCardFooter>
								}
							>
								<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
									<Avatar className="size-16 rounded-full">
										<AvatarImage src={imageURL ?? user.image ?? undefined} />
										<AvatarFallback>{initialsOf(user.name)}</AvatarFallback>
									</Avatar>
									<Field label="Image file" className="flex-1">
										<FieldInput
											type="file"
											accept="image/png,image/jpeg,image/gif,image/webp"
											onChange={selectImage}
										/>
									</Field>
								</div>
							</SettingsCard>
						</form>
					</section>

					<section id="billing" className="scroll-mt-32">
						<form onSubmit={saveBilling}>
							<SettingsCard
								title="Billing Info"
								description="Billing fields are available here without persistence."
								footer={
									<SettingsCardFooter hint="No billing backend is connected.">
										<Button size="sm" type="submit" variant="outline">
											<CreditCard className="size-4" />
											Save
										</Button>
									</SettingsCardFooter>
								}
							>
								<div className="grid gap-4 sm:grid-cols-2">
									<Field label="Billing name">
										<FieldInput autoComplete="cc-name" placeholder="Ada Lovelace" />
									</Field>
									<Field label="ZIP code">
										<FieldInput autoComplete="postal-code" placeholder="12345" />
									</Field>
								</div>
							</SettingsCard>
						</form>
					</section>

			<section id="user-id" className="scroll-mt-32">
				<SettingsCard
					title="User ID"
					description="The stable subject identifier issued in tokens."
					footer={<SettingsCardFooter hint="Used by clients to reference your account." />}
				>
					<div className="flex items-center gap-2">
						<code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-2.5 py-1.5 font-mono text-[0.8125rem]">
							{user.id}
						</code>
						<Button
							variant="outline"
							size="icon"
							onClick={() => copyId(user.id)}
							aria-label="Copy user ID"
						>
							{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
						</Button>
					</div>
					</SettingsCard>
				</section>
				</>
			) : null}
		</DashboardShell>
	);
}
