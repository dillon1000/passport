import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
} from "react";
import { ChevronDown, LogOut, Plus, Settings, UserRound } from "lucide-react";
import { Link } from "react-router";

import { authClient } from "@/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/kumo/primitives/avatar";
import { DropdownMenu } from "@cloudflare/kumo";
import { resolveAddAccountURL } from "@/lib/auth-flow";
import { useAccountSwitch } from "@/lib/account-switch";
import { useFlairMode, type FlairMode } from "@/lib/flair";
import { type RequestLocation } from "@/lib/request-location";
import { initialsOf } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Time-of-day greetings, grouped into eight three-hour blocks. `{name}` is
 * filled with the first name, or dropped when there isn't one.
 */
const GREETINGS: readonly (readonly string[])[] = [
	// 00:00–02:59
	[
		"Late night?",
		"Burning the midnight oil, {name}?",
		"Still up, {name}?",
		"The quiet hours.",
		"Can't sleep, {name}?",
		"The night shift, {name}?",
		"Just you and the moon.",
		"One more thing, {name}?",
		"The world's asleep, {name}.",
		"Witching hour, {name}.",
	],
	// 03:00–05:59
	[
		"You're up early, {name}.",
		"Before the dawn.",
		"Early bird, {name}?",
		"The world's still asleep.",
		"Rise and shine, {name}.",
		"Beating the sun, {name}?",
		"First one up, {name}.",
		"The day's a blank page.",
		"Quiet before the rush, {name}.",
		"Up before the birds, {name}?",
	],
	// 06:00–08:59
	[
		"Good morning, {name}.",
		"Morning, {name}.",
		"Fresh start, {name}?",
		"Up with the sun.",
		"Coffee yet, {name}?",
		"New day, {name}.",
		"Let's make it count, {name}.",
		"Bright and early, {name}.",
		"Ready when you are, {name}.",
		"Here's to today, {name}.",
	],
	// 09:00–11:59
	[
		"How's the morning, {name}?",
		"Hope it's a good one, {name}.",
		"Making progress, {name}?",
		"Mid-morning momentum.",
		"Good to see you, {name}.",
		"In the swing of it, {name}?",
		"Plenty of day left, {name}.",
		"What's on the agenda, {name}?",
		"Cruising along, {name}.",
		"Nice to have you back, {name}.",
	],
	// 12:00–14:59
	[
		"Good afternoon, {name}.",
		"How's it going, {name}?",
		"Lunch yet, {name}?",
		"Halfway there, {name}.",
		"Afternoon, {name}.",
		"Past the hump, {name}.",
		"Keeping busy, {name}?",
		"Hope you ate, {name}.",
		"Afternoon stretch, {name}.",
		"Powering through, {name}?",
	],
	// 15:00–17:59
	[
		"How's the day treating you, {name}?",
		"Home stretch, {name}.",
		"Still going strong, {name}?",
		"Almost there, {name}.",
		"Good afternoon, {name}.",
		"Final push, {name}.",
		"Wrapping things up, {name}?",
		"The day's winding down, {name}.",
		"Hanging in there, {name}?",
		"Nearly clocked out, {name}?",
	],
	// 18:00–20:59
	[
		"Good evening, {name}.",
		"Evening, {name}.",
		"Winding down, {name}?",
		"How was your day, {name}?",
		"Done for the day, {name}?",
		"Time to unwind, {name}.",
		"Dinner yet, {name}?",
		"Clocking off, {name}?",
		"Hope it was a good one, {name}.",
		"Easy does it, {name}.",
	],
	// 21:00–23:59
	[
		"Working late, {name}?",
		"Good night, {name}.",
		"Wrapping up, {name}?",
		"Still at it, {name}?",
		"Evening, {name}.",
		"Don't stay up too late, {name}.",
		"Last call, {name}?",
		"Time to rest, {name}.",
		"Calling it a night, {name}?",
		"The day's nearly done, {name}.",
	],
];

function firstNameOf(name: string): string {
	const trimmed = name.trim();
	if (!trimmed || trimmed.toLowerCase() === "account") return "";
	return trimmed.split(/\s+/)[0];
}

function fillName(template: string, firstName: string): string {
	if (!firstName) return template.replace(/,?\s*\{name\}/g, "").trim();
	return template.replace(/\{name\}/g, firstName);
}

function pickGreeting(name: string): string {
	const options = GREETINGS[Math.floor(new Date().getHours() / 3)];
	const choice = options[Math.floor(Math.random() * options.length)];
	return fillName(choice, firstNameOf(name));
}

function formatDateTime(): string {
	return new Date().toLocaleString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

/**
 * Friendly labels for Better Auth `lastLoginMethod` ids, used to build
 * provider-aware quips ("Back via GitHub."). Unknown methods are skipped so a
 * quip never surfaces a raw internal id.
 */
const PROVIDER_LABELS: Record<string, string> = {
	github: "GitHub",
	discord: "Discord",
	twitter: "X",
	x: "X",
	google: "Google",
	apple: "Apple",
	microsoft: "Microsoft",
	gitlab: "GitLab",
	email: "email",
	credential: "email",
	"magic-link": "a magic link",
	passkey: "a passkey",
	phone: "your phone",
	"phone-number": "your phone",
};

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function providerLabel(method: string | null | undefined): string | null {
	if (!method) return null;
	return PROVIDER_LABELS[method.toLowerCase()] ?? null;
}

/**
 * Assembles the location/provider-aware quip templates that are valid for the
 * current session. Inputs are the coarse request location (city/region/timezone)
 * and the last sign-in method; output is a list of `{name}` templates. Country is
 * intentionally skipped because Cloudflare returns an ISO code ("US") that reads
 * awkwardly in prose. Returns an empty list when there's nothing to riff on.
 */
function quipPool(location: RequestLocation | null, provider: string | null): string[] {
	const pool: string[] = [];
	const { city, region, timezone } = location ?? {};
	if (city) {
		pool.push(
			`How's the weather in ${city}, {name}?`,
			`Greetings from ${city}.`,
			`Beaming in from ${city}.`,
			`${city} in the building.`,
		);
	}
	if (region && region !== city) {
		pool.push(`How's ${region} today, {name}?`, `Repping ${region}?`);
	}
	if (!city && !region && timezone) {
		pool.push(`Running on ${timezone} time.`);
	}
	const label = providerLabel(provider);
	if (label) {
		pool.push(
			`Signed in with ${label}, nice.`,
			`${capitalize(label)} again, {name}?`,
			`Back via ${label}.`,
		);
	}
	return pool;
}

function pickQuip(
	name: string,
	location: RequestLocation | null,
	provider: string | null,
): string {
	const pool = quipPool(location, provider);
	if (pool.length === 0) return "";
	const choice = pool[Math.floor(Math.random() * pool.length)];
	return fillName(choice, firstNameOf(name));
}

type FlairField = Exclude<FlairMode, "rotate">;

/** Order the rotation steps through each field; `quip` is dropped when empty. */
const ROTATION_ORDER: readonly FlairField[] = ["name", "email", "datetime", "greeting", "quip"];

/**
 * Xbox-style flair beside the avatar. In `rotate` mode it cycles through name,
 * email, the date/time, a time-of-day greeting, and a location/provider quip —
 * each step swiping in from the right and out to the left with an eased curve,
 * the track masked on both edges so text dissolves into a soft fade. Long values
 * fall back to the constant-speed marquee. Pinned modes show a single field.
 */
function ProfileFlair({ name, email }: { name: string; email: string }) {
	const { mode } = useFlairMode();
	const { data } = authClient.useSession();
	const location =
		(data?.session as { location?: RequestLocation | null } | undefined)?.location ?? null;
	const provider =
		(data?.user as { lastLoginMethod?: string | null } | undefined)?.lastLoginMethod ?? null;
	const hasQuip = quipPool(location, provider).length > 0;

	const contentFor = (field: FlairField): string => {
		switch (field) {
			case "email":
				return email;
			case "datetime":
				return formatDateTime();
			case "greeting":
				return pickGreeting(name);
			case "quip":
				return pickQuip(name, location, provider) || pickGreeting(name);
			default:
				return name;
		}
	};

	// Skip the quip slide entirely when there's no location or provider to riff on.
	const fields = useMemo(
		() => (hasQuip ? ROTATION_ORDER : ROTATION_ORDER.filter((field) => field !== "quip")),
		[hasQuip],
	);

	const [text, setText] = useState(name);
	const [anim, setAnim] = useState<"in" | "out" | null>(null);
	const index = useRef(0);

	useEffect(() => {
		// Pinned to one field: show it settled (no swipe), but keep the date and
		// time fresh while it's the chosen text.
		if (mode !== "rotate") {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setAnim(null);
			setText(contentFor(mode));
			if (mode !== "datetime") return;
			const tick = setInterval(() => setText(formatDateTime()), 30000);
			return () => clearInterval(tick);
		}

		const HOLD = 4000;
		const SWAP = 500;
		let swap: ReturnType<typeof setTimeout>;
		const cycle = setInterval(() => {
			setAnim("out");
			swap = setTimeout(() => {
				index.current = (index.current + 1) % fields.length;
				setText(contentFor(fields[index.current]));
				setAnim("in");
			}, SWAP);
		}, HOLD + SWAP);
		return () => {
			clearInterval(cycle);
			clearTimeout(swap);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [name, email, mode, fields, location, provider]);

	// Measure how far the current text overruns the fixed track so the marquee
	// only kicks in when it can't fit, and never truncates with an ellipsis.
	const trackRef = useRef<HTMLSpanElement>(null);
	const textRef = useRef<HTMLSpanElement>(null);
	const [overflow, setOverflow] = useState(0);
	useLayoutEffect(() => {
		const track = trackRef.current;
		const el = textRef.current;
		if (!track || !el) return;
		setOverflow(Math.max(0, Math.ceil(el.scrollWidth - track.clientWidth)));
	}, [text]);

	const scrolling = overflow > 0;
	const marqueeStyle: CSSProperties = {
		"--flair-shift": `-${overflow}px`,
		"--flair-duration": `${(overflow / 22 + 3).toFixed(2)}s`,
	} as CSSProperties;

	return (
		<span
			aria-hidden
			ref={trackRef}
			className="hidden w-44 overflow-hidden text-sm tabular-nums text-muted-foreground sm:block lg:w-64 [mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]"
		>
			<span
				key={text}
				className={cn(
					"flex whitespace-nowrap",
					(scrolling || anim) && "will-change-transform",
					scrolling ? "justify-start" : "justify-end",
					anim === "in" && "flair-swipe-in motion-reduce:animate-none",
					anim === "out" && "flair-swipe-out motion-reduce:animate-none",
				)}
			>
				<span
					ref={textRef}
					style={scrolling ? marqueeStyle : undefined}
					className={cn(
						"inline-block",
						scrolling ? "px-6 flair-marquee motion-reduce:animate-none" : "pr-6",
					)}
				>
					{text}
				</span>
			</span>
		</span>
	);
}

/** A unique same-browser account that can become the active Better Auth session. */
type DeviceAccount = {
	session: { token: string };
	user: { id: string; name: string; email: string; image?: string | null };
};

async function loadDeviceAccounts(): Promise<DeviceAccount[]> {
	const result = await authClient.multiSession.listDeviceSessions();
	if (result.error) return [];

	const accounts = new Map<string, DeviceAccount>();
	for (const account of (result.data ?? []) as DeviceAccount[]) {
		if (!accounts.has(account.user.id)) accounts.set(account.user.id, account);
	}
	return [...accounts.values()];
}

/** Right-aligned account menu in the top bar — avatar trigger with a popover. */
export function UserMenu({
	name,
	email,
	image,
	initials,
	onSignOut,
}: {
	name: string;
	email: string;
	image?: string | null;
	initials: string;
	onSignOut: () => void;
}) {
	const { data: session } = authClient.useSession();
	const [open, setOpen] = useState(false);
	const [accounts, setAccounts] = useState<DeviceAccount[]>([]);
	const [switching, setSwitching] = useState(false);
	const beginAccountSwitch = useAccountSwitch((state) => state.begin);
	const clearAccountSwitch = useAccountSwitch((state) => state.clear);
	const otherAccounts = accounts.filter((account) => account.user.id !== session?.user.id);
	const callbackURL = window.location.pathname + window.location.search;

	useEffect(() => {
		if (!open) return;
		void loadDeviceAccounts().then(setAccounts);
	}, [open]);

	/** Makes a browser account active, then reloads the current route under that session. */
	async function switchAccount(account: DeviceAccount) {
		setSwitching(true);
		beginAccountSwitch(account.user);
		const result = await authClient.multiSession.setActive({ sessionToken: account.session.token });
		if (result.error) {
			setSwitching(false);
			clearAccountSwitch();
			return;
		}
		window.location.assign(callbackURL);
	}

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenu.Trigger render={
				<button
					type="button"
					aria-label="Account menu"
					className="flex min-h-10 items-center gap-2 rounded-full py-1 pr-1.5 pl-2 transition-[scale,box-shadow] duration-150 ease-out active:scale-[0.96] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
				>
					<ProfileFlair name={name} email={email} />
					<Avatar className="size-8 rounded-full">
						<AvatarImage src={image ?? undefined} />
						<AvatarFallback className="text-xs">{initials}</AvatarFallback>
					</Avatar>
					<ChevronDown className="size-3.5 text-muted-foreground" />
				</button>
			} />
			<DropdownMenu.Content align="end" className="w-60">
				<div className="flex items-center gap-2.5 px-1.5 py-1.5">
					<Avatar className="size-8 rounded-full">
						<AvatarImage src={image ?? undefined} />
						<AvatarFallback className="text-xs">{initials}</AvatarFallback>
					</Avatar>
					<div className="min-w-0">
						<div className="truncate text-sm font-medium">{name}</div>
						<div className="truncate text-xs text-muted-foreground">{email}</div>
					</div>
				</div>
				<DropdownMenu.Separator />
				<DropdownMenu.Label>Switch account</DropdownMenu.Label>
				<DropdownMenu.Item disabled>
					<Avatar size="sm">
						<AvatarImage src={image ?? undefined} />
						<AvatarFallback>{initials}</AvatarFallback>
					</Avatar>
					<span className="min-w-0 flex-1 truncate">{email}</span>
					<span className="text-xs text-muted-foreground">Current</span>
				</DropdownMenu.Item>
				{otherAccounts.map((account) => (
					<DropdownMenu.Item
						key={account.session.token}
						disabled={switching}
						onClick={() => {
							void switchAccount(account);
						}}
					>
						<Avatar size="sm">
							<AvatarImage src={account.user.image ?? undefined} />
							<AvatarFallback>{initialsOf(account.user.name)}</AvatarFallback>
						</Avatar>
						<span className="min-w-0 flex-1 truncate">{account.user.email}</span>
					</DropdownMenu.Item>
				))}
				<DropdownMenu.LinkItem href={resolveAddAccountURL(callbackURL)}>
						<Plus />
						Add account
				</DropdownMenu.LinkItem>
				<DropdownMenu.Separator />
				<DropdownMenu.LinkItem render={<Link to="/account" />}>
						<UserRound />
						Account
				</DropdownMenu.LinkItem>
				<DropdownMenu.LinkItem render={<Link to="/settings" />}>
						<Settings />
						Settings
				</DropdownMenu.LinkItem>
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="danger" onClick={onSignOut}>
					<LogOut />
					Sign out
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}
