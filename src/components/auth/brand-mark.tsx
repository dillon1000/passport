import { useBrand } from "@/lib/brand-runtime";
import { cn } from "@/lib/utils";

/**
 * Whitelabel logo. Renders the configured logo image, or a neutral tile with
 * the brand abbreviation. Colour comes from the `--brand` token so a tenant
 * rebrands by overriding one variable.
 */
export function BrandMark({ className }: { className?: string }) {
	const brand = useBrand();

	if (brand.logoSrc) {
		return (
			<img
				src={brand.logoSrc}
				alt=""
				className={cn("size-8 rounded-md object-cover", className)}
			/>
		);
	}

	return (
		<span
			aria-hidden="true"
			className={cn(
				"grid size-8 shrink-0 place-items-center rounded-md bg-brand font-mono text-xs font-semibold tracking-tight text-brand-foreground",
				className,
			)}
		>
			{brand.abbreviation}
		</span>
	);
}
