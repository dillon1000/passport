import { useEffect } from "react";

import { authClient } from "@/auth-client";

/**
 * Loads the session and redirects unauthenticated visitors to sign-in,
 * preserving where they were headed. Use at the top of any dashboard page.
 */
export function useRequireSession() {
	const query = authClient.useSession();
	useEffect(() => {
		if (!query.isPending && !query.data) {
			const callbackURL = window.location.pathname + window.location.search;
			window.location.assign(`/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`);
		}
	}, [query.isPending, query.data]);
	return query;
}

export async function signOut() {
	await authClient.signOut();
	window.location.assign("/sign-in?signedOut=1");
}

export function initialsOf(name?: string | null) {
	return (
		name
			?.split(" ")
			.map((part) => part[0])
			.join("")
			.slice(0, 2)
			.toUpperCase() || "PA"
	);
}
