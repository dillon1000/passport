/**
 * Single source of truth for whitelabel identity. To rebrand the entire
 * auth surface, change the values here and override the `--brand` /
 * `--brand-foreground` CSS variables in `index.css` (or via a tenant
 * stylesheet). No component hardcodes the product name.
 */
export interface Brand {
	/** Display name, e.g. "Passport". */
	name: string;
	/** Short product descriptor shown under the name. */
	descriptor: string;
	/** Optional absolute URL to a wordmark image; overrides the default Passport wordmark. */
	logoSrc?: string;
	/** Technical capabilities surfaced in the footer for operators. */
	capabilities: string[];
}

export const brand: Brand = {
	name: "Passport",
	descriptor: "Identity provider",
	capabilities: ["Log in to your apps."],
};
