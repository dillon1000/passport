/** Copy and icons for security settings confirmation dialogs. */
import { ShieldOff, Trash2, Unlink } from "@/lib/icons";
import { SOCIAL_PROVIDERS } from "@/components/auth/social-provider-config";

export type SecurityConfirmationAction =
	| { type: "delete-passkey"; passkeyId: string }
	| { type: "unlink-provider"; account: { id: string; providerId: string; accountId: string } }
	| { type: "disable-two-factor" };

export function securityConfirmationCopy(action: SecurityConfirmationAction) {
	if (action.type === "delete-passkey") {
		return { title: "Remove passkey?", description: "This removes the passkey from your account. You can add it again from this device later.", confirmLabel: "Remove passkey", Icon: Trash2 };
	}
	if (action.type === "unlink-provider") {
		const provider = SOCIAL_PROVIDERS.find((candidate) => candidate.id === action.account.providerId);
		return { title: "Unlink account?", description: `Unlink ${provider?.label ?? action.account.providerId} from this Passport account. You can reconnect it later.`, confirmLabel: "Unlink account", Icon: Unlink };
	}
	return { title: "Disable 2FA?", description: "Password sign-ins will no longer require an authenticator code.", confirmLabel: "Disable 2FA", Icon: ShieldOff };
}
