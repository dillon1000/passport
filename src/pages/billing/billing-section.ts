/** Maps billing routes to the content section rendered by the billing page. */
export function billingSection(pathname: string) {
	if (pathname.endsWith("/plans")) return "plans";
	if (pathname.endsWith("/purchases")) return "purchases";
	return "overview";
}
