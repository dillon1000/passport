/**
 * Checks a password against Have I Been Pwned without sending the password or
 * full hash. The range API receives only five SHA-1 characters; matching stays
 * in the browser. Network failures are reported so the caller can fail open.
 */
export async function checkPwnedPassword(
	password: string,
	fetcher: typeof fetch = fetch,
): Promise<number> {
	const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
	const hash = Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	)
		.join("")
		.toUpperCase();
	const prefix = hash.slice(0, 5);
	const suffix = hash.slice(5);
	const response = await fetcher(`https://api.pwnedpasswords.com/range/${prefix}`, {
		headers: { "Add-Padding": "true" },
	});

	if (!response.ok) throw new Error(`Password breach check failed with ${response.status}.`);

	for (const line of (await response.text()).split(/\r?\n/)) {
		const [candidate, count] = line.split(":");
		if (candidate === suffix) return Number.parseInt(count ?? "0", 10) || 0;
	}
	return 0;
}
