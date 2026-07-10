import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type MouseEvent,
} from "react";

import { cn } from "@/lib/utils";

export interface Section {
	id: string;
	label: string;
}

/**
 * Sticky in-page navigation for the settings sections. Highlights the section
 * currently in view (scroll-spy) and scrolls to a section on click. A single
 * accent indicator slides to the active item rather than every row carrying its
 * own border. Anchors stay keyboard-focusable and work without JS.
 */
export function SectionNav({ sections }: { sections: Section[] }) {
	const [active, setActive] = useState(sections[0]?.id);
	const listRef = useRef<HTMLUListElement>(null);
	const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) setActive(entry.target.id);
				}
			},
			{ rootMargin: "-20% 0px -70% 0px" },
		);
		for (const section of sections) {
			const element = document.getElementById(section.id);
			if (element) observer.observe(element);
		}
		return () => observer.disconnect();
	}, [sections]);

	// Track the active row so the accent indicator can slide to it. Measured in
	// layout to avoid a flash, then transitions are enabled on the next frame so
	// the indicator doesn't animate in from the top on first paint.
	useLayoutEffect(() => {
		const element = listRef.current?.querySelector<HTMLElement>(`[data-section="${active}"]`);
		if (element) setIndicator({ top: element.offsetTop, height: element.offsetHeight });
	}, [active, sections]);

	useEffect(() => {
		const frame = requestAnimationFrame(() => setReady(true));
		return () => cancelAnimationFrame(frame);
	}, []);

	function handleClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
		event.preventDefault();
		setActive(id);
		document.getElementById(id)?.scrollIntoView({ block: "start" });
		history.replaceState(null, "", `#${id}`);
	}

	return (
		<nav aria-label="Account sections" className="sticky top-20">
			<ul ref={listRef} className="relative flex flex-col gap-0.5">
				{indicator ? (
					<span
						aria-hidden
						className={cn(
							"pointer-events-none absolute left-0 w-0.5 rounded-full bg-foreground",
							ready && "transition-[top,height] duration-300 ease-out",
						)}
						style={{ top: indicator.top + 8, height: Math.max(indicator.height - 16, 0) }}
					/>
				) : null}
				{sections.map((section) => {
					const isActive = active === section.id;
					return (
						<li key={section.id}>
							<a
								data-section={section.id}
								href={`#${section.id}`}
								onClick={(event) => handleClick(event, section.id)}
								aria-current={isActive ? "true" : undefined}
								className={cn(
									"flex min-h-9 items-center rounded-md px-3 py-2 text-sm transition-colors duration-150 ease-out active:scale-[0.98]",
									isActive
										? "bg-accent font-medium text-foreground"
										: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
								)}
							>
								{section.label}
							</a>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
