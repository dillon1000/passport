import { cn } from "@/lib/utils";
import { z } from "zod";

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

const publicIconPairSchema = z.object({ light: z.string(), dark: z.string() });

export function PublicIcon({ src, className }: { src: PublicIconSource; className?: string }) {
	const single = z.string().safeParse(src);
	if (single.success) {
		return (
			<img
				src={single.data}
				alt=""
				aria-hidden="true"
				draggable={false}
				className={cn("size-4 shrink-0 object-contain", className)}
			/>
		);
	}
	const source = publicIconPairSchema.parse(src);

	return (
		<span aria-hidden="true" className={cn("relative inline-block size-4 shrink-0", className)}>
			<img
				src={source.light}
				alt=""
				draggable={false}
				className="size-full object-contain dark:hidden"
			/>
			<img
				src={source.dark}
				alt=""
				draggable={false}
				className="hidden size-full object-contain dark:block"
			/>
		</span>
	);
}
