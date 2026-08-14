/**
 * Browser capability guard for authentication flows that render the CAPTCHA
 * challenge. The result is true only when the browser exposes WebAssembly.
 */
export function isWebAssemblyAvailable() {
	return typeof WebAssembly !== "undefined";
}
