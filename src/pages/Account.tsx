import { useId, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { Image as ImageIcon, MailPlus, Save, Upload } from "@/lib/icons";

import { authClient } from "@/auth-client";
import { DashboardShell } from "@/components/auth/dashboard-shell";
import { Field, FieldInput } from "@/components/auth/field";
import { type Section } from "@/components/auth/section-nav";
import { SettingsCard, SettingsCardFooter } from "@/components/auth/settings-card";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/kumo/primitives/avatar";
import { Badge } from "@/components/kumo/primitives/badge";
import { Button } from "@/components/kumo/primitives/button";
import { ClipboardText } from "@/components/kumo/primitives/clipboard-text";
import { Label } from "@/components/kumo/primitives/label";
import { normalizeEmailChangeValue } from "@/lib/account";
import { uploadProfileImageAsset } from "@/lib/image-upload";
import { initialsOf, useRequireSession } from "@/lib/session";

const SECTIONS: Section[] = [
	{ id: "profile", label: "Profile" },
	{ id: "email", label: "Email" },
	{ id: "picture", label: "Picture" },
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

export function Account() {
	const { data: session } = useRequireSession();
	const searchParams = new URLSearchParams(window.location.search);
	const [status, setStatus] = useState<Status | null>(() => {
		if (searchParams.get("emailChanged") === "1") {
			return { tone: "success", message: "Email changed." };
		}
		if (searchParams.get("verified") === "1") {
			return { tone: "success", message: "Email verified." };
		}
		if (searchParams.get("error")) {
			return { tone: "error", message: `Account update failed: ${searchParams.get("error")}` };
		}
		return null;
	});
	const [busy, setBusy] = useState<string | null>(null);
	const [newEmail, setNewEmail] = useState("");
	const [imageURL, setImageURL] = useState<string | null>(null);
	const [imageFile, setImageFile] = useState<File | null>(null);
	const imageInputId = useId();
	const imageInputDescriptionId = `${imageInputId}-description`;
	const user = session?.user as AccountUser | undefined;

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
		const nextEmail = normalizeEmailChangeValue(newEmail);
		if (!nextEmail) {
			setStatus({ tone: "error", message: "Enter a new email address." });
			return;
		}
		setStatus(null);
		setBusy("email");
		const result = await authClient.changeEmail({
			newEmail: nextEmail,
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

	/** Selects the first dropped image so dropping and browsing use one upload state. */
	function dropImage(event: DragEvent<HTMLLabelElement>) {
		event.preventDefault();
		setImageFile(event.dataTransfer.files?.[0] ?? null);
	}

	async function uploadProfileImage(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!imageFile) {
			setStatus({ tone: "error", message: "Choose a profile picture first." });
			return;
		}

		setStatus(null);
		setBusy("picture");
		try {
			const image = await uploadProfileImageAsset(imageFile);
			const result = await authClient.updateUser({ image });
			if (result.error) {
				setStatus({
					tone: "error",
					message: result.error.message ?? "Could not save profile picture.",
				});
				return;
			}
			setImageURL(image);
			setStatus({ tone: "success", message: "Profile picture updated." });
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not upload profile picture.",
			});
		} finally {
			setBusy(null);
		}
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
										<Button
											size="sm"
											type="submit"
											disabled={busy === "email" || !normalizeEmailChangeValue(newEmail)}
										>
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
									<div className="min-w-0 flex-1 space-y-1.5">
										<Label htmlFor={imageInputId}>Image file</Label>
										<input
											id={imageInputId}
											type="file"
											className="sr-only"
											accept="image/png,image/jpeg,image/gif,image/webp"
											aria-describedby={imageInputDescriptionId}
											onChange={selectImage}
										/>
										<label
											htmlFor={imageInputId}
											onDragOver={(event) => event.preventDefault()}
											onDrop={dropImage}
											className="group flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-input bg-muted/30 p-3 transition-[border-color,background-color,transform] duration-150 ease-out hover:border-ring/70 hover:bg-muted/50 active:scale-[0.96] focus-within:border-ring focus-within:bg-muted/50 focus-within:ring-3 focus-within:ring-ring/35"
										>
											<span className="grid size-10 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground shadow-xs transition-[color,background-color] duration-150 group-hover:bg-primary/10 group-hover:text-primary">
												<ImageIcon className="size-5" aria-hidden="true" />
											</span>
											<span className="min-w-0 flex-1">
												<span className="block truncate text-sm font-medium text-foreground">
													{imageFile ? imageFile.name : "Choose a profile picture"}
												</span>
												<span id={imageInputDescriptionId} className="mt-0.5 block text-xs text-muted-foreground" aria-live="polite">
													{imageFile ? "Ready to upload" : "Drop an image here or browse your files"}
												</span>
											</span>
											<span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground shadow-xs transition-[background-color,transform] duration-150 group-hover:bg-muted group-active:scale-[0.96]">
												<Upload className="size-3.5" aria-hidden="true" />
												Browse
											</span>
										</label>
									</div>
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
					<ClipboardText
						text={user.id}
						size="sm"
						labels={{ copyAction: "Copy user ID" }}
					/>
					</SettingsCard>
				</section>
				</>
			) : null}
		</DashboardShell>
	);
}
