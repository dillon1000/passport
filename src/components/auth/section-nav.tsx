import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type MouseEvent,
} from "react";

import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/kumo/primitives/sheet";
import { ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";

export interface Section {
	id: string;
	label: string;
}

/**
 * Scroll-spy shared by the desktop rail and the mobile drawer so both agree on
 * which section is current. Returns the active id plus the click handler that
 * jumps to a section without letting the anchor's default jump fight the
 * observer.
 */
function useActiveSection(sections: Section[]) {
	const [active, setActive] = useState(sections[0]?.id);

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

	const select = useCallback((event: MouseEvent<HTMLAnchorElement>, id: string) => {
		event.preventDefault();
		setActive(id);
		document.getElementById(id)?.scrollIntoView({ block: "start" });
		history.replaceState(null, "", `#${id}`);
	}, []);

	return { active, select };
}

/**
 * Sticky in-page navigation for the settings sections. Highlights the section
 * currently in view (scroll-spy) and scrolls to a section on click. A single
 * accent indicator slides to the active item rather than every row carrying its
 * own border. Anchors stay keyboard-focusable and work without JS.
 */
export function SectionNav({ sections }: { sections: Section[] }) {
	const { active, select } = useActiveSection(sections);
	const listRef = useRef<HTMLUListElement>(null);
	const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
	const [ready, setReady] = useState(false);

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
		select(event, id);
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

/**
 * Mobile counterpart to `SectionNav`. A trigger names the section you're
 * currently in and opens a sheet holding the full list, so the section rail
 * stays reachable on screens too narrow for the desktop rail.
 */
export function SectionNavDrawer({ sections }: { sections: Section[] }) {
	const { active, select } = useActiveSection(sections);
	const [open, setOpen] = useState(false);
	const activeLabel = sections.find((section) => section.id === active)?.label ?? sections[0]?.label;

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger
				render={
					<button
						type="button"
						aria-label={`Jump to section — currently ${activeLabel}`}
						className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border bg-background px-3.5 text-sm transition-colors hover:bg-accent/60 active:scale-[0.99]"
					>
						<span className="min-w-0 truncate font-medium">{activeLabel}</span>
						<ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
					</button>
				}
			/>
			<SheetContent className="!h-auto !max-h-[min(70dvh,32rem)]">
				<SheetHeader>
					<SheetTitle>Sections</SheetTitle>
				</SheetHeader>
				<SheetBody className="!py-3">
					<ul className="flex flex-col gap-0.5">
						{sections.map((section) => {
							const isActive = active === section.id;
							return (
								<li key={section.id}>
									<a
										href={`#${section.id}`}
										onClick={(event) => {
											select(event, section.id);
											setOpen(false);
										}}
										aria-current={isActive ? "true" : undefined}
										className={cn(
											"flex min-h-11 items-center rounded-md px-3 text-sm transition-colors duration-150 ease-out active:scale-[0.98]",
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
				</SheetBody>
			</SheetContent>
		</Sheet>
	);
}
