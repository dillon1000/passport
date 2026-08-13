/**
 * Shared account-switch transition state. Account pickers set this before
 * Better Auth activates a local session; the app-level overlay blocks input
 * until the caller either redirects or clears a failed transition.
 */
import { create } from "zustand";

export type SwitchingAccount = {
	name: string;
	email: string;
	image?: string | null;
};

type AccountSwitchState = {
	account: SwitchingAccount | null;
	begin: (account: SwitchingAccount) => void;
	clear: () => void;
};

export const useAccountSwitch = create<AccountSwitchState>((set) => ({
	account: null,
	begin: (account) => set({ account }),
	clear: () => set({ account: null }),
}));
