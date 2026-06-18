/**
 * Admin access helpers. Inputs are runtime admin configuration and the current
 * Better Auth user/session shape; outputs are booleans used by both server auth
 * policy and Worker route guards. Safe configuration points are `ADMIN_EMAILS`,
 * `ADMIN_USER_IDS`, and comma-separated role names on the user record.
 */
export type AdminAccessEnv = {
	ADMIN_EMAILS?: string;
	ADMIN_USER_IDS?: string;
};

export type AdminOperatorCandidate = {
	id?: string | null;
	email?: string | null;
	role?: string | null;
};

function splitCSV(value: string | undefined) {
	return (
		value
			?.split(",")
			.map((item) => item.trim())
			.filter(Boolean) ?? []
	);
}

function normalizeEmail(email: string | null | undefined) {
	return email?.trim().toLowerCase() ?? "";
}

function roleNames(role: string | null | undefined) {
	return splitCSV(role ?? undefined).map((item) => item.toLowerCase());
}

export function isAdminEmail(
	env: Pick<AdminAccessEnv, "ADMIN_EMAILS">,
	email: string | null | undefined,
) {
	const adminEmails = splitCSV(env.ADMIN_EMAILS).map((item) => normalizeEmail(item));
	return adminEmails.includes(normalizeEmail(email));
}

export function hasAdminRole(user: Pick<AdminOperatorCandidate, "role"> | null | undefined) {
	return roleNames(user?.role).includes("admin");
}

export function isAdminOperator(
	env: AdminAccessEnv,
	user: AdminOperatorCandidate | null | undefined,
) {
	if (!user) return false;
	if (hasAdminRole(user)) return true;
	if (user.id && splitCSV(env.ADMIN_USER_IDS).includes(user.id)) return true;
	return isAdminEmail(env, user.email);
}
