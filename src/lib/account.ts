/**
 * Account page input helpers. Inputs are browser form values from account
 * profile controls; outputs are normalized values passed to Better Auth. Keep
 * server-side validation authoritative and only normalize obvious user-entry
 * whitespace here.
 */
export function normalizeEmailChangeValue(value: string) {
	return value.trim();
}
