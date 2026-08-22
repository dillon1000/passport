/** OAuth client page access rules shared by the page and its focused unit tests. */
import { hasAdminRole } from "@/lib/admin-access";

export function canShowManagedOAuthClients(
	user: { role?: string | null } | null | undefined,
	state: { adminAvailable: boolean },
) {
	return hasAdminRole(user) || state.adminAvailable;
}
