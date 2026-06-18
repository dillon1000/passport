/**
 * Password confirmation rules shared by account creation and password reset
 * forms. Inputs are the primary password and the user-entered verification
 * value; outputs are either a display-ready field error or a boolean gate for
 * submit controls. Update the messages here when password confirmation copy
 * needs to change across auth forms.
 */
export function getPasswordConfirmationError(password: string, confirmation: string) {
	if (!confirmation) return "Verify your password.";
	if (password !== confirmation) return "Passwords don't match.";
	return null;
}

export function isPasswordConfirmationReady(password: string, confirmation: string) {
	return Boolean(password) && getPasswordConfirmationError(password, confirmation) === null;
}
