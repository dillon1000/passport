import { useBrand } from "@/lib/brand-runtime";
import { cn } from "@/lib/utils";

/** Default Passport wordmark asset, served from `public/`. A whitelabel tenant
 *  overrides it by setting `logoSrc` in the brand config. */
const WORDMARK_SRC = "/passport.png";

/**
 * Brand wordmark. Renders the configured logo image, falling back to the
 * Passport wordmark. Sized by height; width follows the source aspect ratio.
 * Because the wordmark already spells the product name, callers should not
 * place the brand name beside it.
 */
export function Wordmark({ className }: { className?: string }) {
	const brand = useBrand();
	return (
		<img
			src={brand.logoSrc ?? WORDMARK_SRC}
			alt={brand.name}
			className={cn("h-7 w-auto select-none", className)}
		/>
	);
}
