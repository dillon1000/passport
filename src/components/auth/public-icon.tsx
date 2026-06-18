import { cn } from "@/lib/utils";

/**
 * Decorative image renderer for files in `public/icons`. Vite serves public
 * assets from the site root, so callers pass stable paths such as
 * `/icons/github_light.svg`. Light/dark pairs swap under the app's `.dark`
 * theme class while keeping the visible label in surrounding text.
 */
export type PublicIconSource =
	| string
	| {
			light: string;
			dark: string;
	  };

export function PublicIcon({ src, className }: { src: PublicIconSource; className?: string }) {
	if (typeof src === "string") {
		return (
			<img
				src={src}
				alt=""
				aria-hidden="true"
				draggable={false}
				className={cn("size-4 shrink-0 object-contain", className)}
			/>
		);
	}

	return (
		<span aria-hidden="true" className={cn("relative inline-block size-4 shrink-0", className)}>
			<img
				src={src.light}
				alt=""
				draggable={false}
				className="size-full object-contain dark:hidden"
			/>
			<img
				src={src.dark}
				alt=""
				draggable={false}
				className="hidden size-full object-contain dark:block"
			/>
		</span>
	);
}
