/**
 * Single source of truth for whitelabel identity. To rebrand the entire
 * auth surface, change the values here and override the `--brand` /
 * `--brand-foreground` CSS variables in `index.css` (or via a tenant
 * stylesheet). No component hardcodes the product name.
 */
export interface Brand {
	/** Display name, e.g. "Passport". */
	name: string;
	/** 2–3 letter mark shown in the logo tile when no logo image is set. */
	abbreviation: string;
	/** Short product descriptor shown under the name. */
	descriptor: string;
	/** Optional absolute URL to a logo image; falls back to the abbreviation. */
	logoSrc?: string;
	/** Technical capabilities surfaced in the footer for operators. */
	capabilities: string[];
}

export const brand: Brand = {
	name: "Passport",
	abbreviation: "PP",
	descriptor: "Identity provider",
	capabilities: ["OIDC", "PKCE", "JWKS"],
};
