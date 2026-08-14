/**
 * React Email templates for transactional mail. Each template renders to the
 * HTML body sent through the EMAIL binding; the plain-text bodies live alongside
 * the senders in `../email.ts`. Dynamic values are interpolated as JSX children
 * or attributes, so React escapes them automatically.
 */
import {
	Body,
	Container,
	Head,
	Heading,
	Html,
	Link,
	Preview,
	Section,
	Text,
} from "@react-email/components";

import { brand } from "../lib/brand";
import type { RequestMetadata } from "../lib/request-metadata";

const colors = {
	background: "#f5f5f5",
	surface: "#ffffff",
	border: "#e5e5e5",
	heading: "#171717",
	text: "#404040",
	muted: "#737373",
	buttonBackground: "#171717",
	buttonText: "#ffffff",
	code: "#171717",
} as const;

const fontFamily =
	'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function EmailLayout({ preview, children }: { preview: string; children: React.ReactNode }) {
	return (
		<Html lang="en">
			<Head />
			<Preview>{preview}</Preview>
			<Body style={{ backgroundColor: colors.background, margin: 0, padding: "24px 0", fontFamily }}>
				<Container
					style={{
						backgroundColor: colors.surface,
						border: `1px solid ${colors.border}`,
						borderRadius: "12px",
						margin: "0 auto",
						maxWidth: "440px",
						padding: "32px",
					}}
				>
					<Text
						style={{
							color: colors.heading,
							fontSize: "15px",
							fontWeight: 600,
							letterSpacing: "-0.01em",
							margin: "0 0 24px",
						}}
					>
						{brand.name}
					</Text>
					{children}
					<Section style={{ borderTop: `1px solid ${colors.border}`, marginTop: "32px", paddingTop: "16px" }}>
						<Text style={{ color: colors.muted, fontSize: "12px", lineHeight: "18px", margin: 0 }}>
							If you did not request this email, you can safely ignore it.
						</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

function Heading2({ children }: { children: React.ReactNode }) {
	return (
		<Heading
			as="h1"
			style={{
				color: colors.heading,
				fontSize: "20px",
				fontWeight: 600,
				letterSpacing: "-0.02em",
				margin: "0 0 12px",
			}}
		>
			{children}
		</Heading>
	);
}

function Paragraph({ children }: { children: React.ReactNode }) {
	return (
		<Text style={{ color: colors.text, fontSize: "14px", lineHeight: "22px", margin: "0 0 16px" }}>
			{children}
		</Text>
	);
}

function DetailList({ metadata }: { metadata: RequestMetadata }) {
	const details = [
		["Time", new Date(metadata.time).toLocaleString()],
		["Browser", metadata.browser],
		["Operating system", metadata.operatingSystem],
		["Device", metadata.device],
		["Location", metadata.locationLabel],
		["IP address", metadata.ipAddress ?? "Unknown"],
	] as const;

	return (
		<Section
			style={{
				backgroundColor: "#fafafa",
				border: `1px solid ${colors.border}`,
				borderRadius: "10px",
				margin: "20px 0",
				padding: "12px 14px",
			}}
		>
			{details.map(([label, value]) => (
				<Text
					key={label}
					style={{
						color: colors.text,
						fontSize: "13px",
						lineHeight: "19px",
						margin: "0 0 6px",
					}}
				>
					<strong style={{ color: colors.heading }}>{label}:</strong> {value}
				</Text>
			))}
		</Section>
	);
}

function ActionButton({ url, label }: { url: string; label: string }) {
	// Inline anchor (not @react-email/components Button) so we can also surface
	// the raw URL fallback below it for clients that strip the button.
	return (
		<Section style={{ margin: "24px 0" }}>
			<Link
				href={url}
				style={{
					backgroundColor: colors.buttonBackground,
					borderRadius: "8px",
					color: colors.buttonText,
					display: "inline-block",
					fontSize: "14px",
					fontWeight: 500,
					padding: "10px 20px",
					textDecoration: "none",
				}}
			>
				{label}
			</Link>
			<Text style={{ color: colors.muted, fontSize: "12px", lineHeight: "18px", margin: "16px 0 0" }}>
				Or copy and paste this URL into your browser:
				<br />
				<Link href={url} style={{ color: colors.muted, wordBreak: "break-all" }}>
					{url}
				</Link>
			</Text>
		</Section>
	);
}

export function ActionEmail({
	heading,
	intro,
	buttonLabel,
	url,
}: {
	heading: string;
	intro: string;
	buttonLabel: string;
	url: string;
}) {
	return (
		<EmailLayout preview={intro}>
			<Heading2>{heading}</Heading2>
			<Paragraph>{intro}</Paragraph>
			<ActionButton url={url} label={buttonLabel} />
		</EmailLayout>
	);
}

export function OrganizationInvitationEmail({
	organizationName,
	inviterName,
	url,
}: {
	organizationName: string;
	inviterName: string;
	url: string;
}) {
	return (
		<EmailLayout preview={`${inviterName} invited you to join ${organizationName} on ${brand.name}`}>
			<Heading2>Join {organizationName}</Heading2>
			<Paragraph>
				{inviterName} invited you to join {organizationName} on {brand.name}. Accept the invitation to get started.
			</Paragraph>
			<ActionButton url={url} label="Accept invitation" />
		</EmailLayout>
	);
}

export function SecurityAlertEmail({
	event,
	metadata,
}: {
	event: string;
	metadata: RequestMetadata;
}) {
	return (
		<EmailLayout preview={`${event} on ${brand.name}`}>
			<Heading2>{event}</Heading2>
			<Paragraph>
				We noticed this activity on your {brand.name} account. Review the details below and secure your account if you do not recognize it.
			</Paragraph>
			<DetailList metadata={metadata} />
		</EmailLayout>
	);
}

export function DataExportRequestedEmail({
	cancelURL,
	metadata,
}: {
	cancelURL: string;
	metadata: RequestMetadata;
}) {
	return (
		<EmailLayout preview={`A ${brand.name} data export was requested`}>
			<Heading2>Data export requested</Heading2>
			<Paragraph>
				A data export was requested for your {brand.name} account. We will begin preparing it in 15 minutes.
			</Paragraph>
			<DetailList metadata={metadata} />
			<ActionButton url={cancelURL} label="Review or cancel request" />
		</EmailLayout>
	);
}

export function DataExportReadyEmail({
	downloadURL,
	expiresAt,
	metadata,
}: {
	downloadURL: string;
	expiresAt: string;
	metadata: RequestMetadata;
}) {
	return (
		<EmailLayout preview={`Your ${brand.name} data export is ready`}>
			<Heading2>Data export ready</Heading2>
			<Paragraph>
				Your data export is ready to download. The link expires{" "}
				{new Date(expiresAt).toLocaleString()}.
			</Paragraph>
			<DetailList metadata={metadata} />
			<ActionButton url={downloadURL} label="Download data" />
		</EmailLayout>
	);
}

export function OTPEmail({ otp }: { otp: string }) {
	return (
		<EmailLayout preview={`Your ${brand.name} verification code`}>
			<Heading2>Verification code</Heading2>
			<Paragraph>Enter this code to finish signing in. It expires shortly. Do not share it with anyone.</Paragraph>
			<Section style={{ margin: "24px 0" }}>
				<Text
					style={{
						color: colors.code,
						fontSize: "32px",
						fontWeight: 600,
						letterSpacing: "0.3em",
						margin: 0,
					}}
				>
					{otp}
				</Text>
			</Section>
		</EmailLayout>
	);
}
