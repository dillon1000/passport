import { useEffect, useState, type MouseEvent } from "react";

import { cn } from "@/lib/utils";

export interface Section {
	id: string;
	label: string;
}

/**
 * Sticky in-page navigation for the settings sections. Highlights the section
 * currently in view (scroll-spy) and scrolls to a section on click. Anchors
 * stay keyboard-focusable and work without JS.
 */
export function SectionNav({ sections }: { sections: Section[] }) {
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

	function handleClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
		event.preventDefault();
		setActive(id);
		document.getElementById(id)?.scrollIntoView({ block: "start" });
		history.replaceState(null, "", `#${id}`);
	}

	return (
		<nav aria-label="Account sections" className="sticky top-20">
			<ul className="flex flex-col gap-0.5 border-l">
				{sections.map((section) => {
					const isActive = active === section.id;
					return (
						<li key={section.id} className="-ml-px">
							<a
								href={`#${section.id}`}
								onClick={(event) => handleClick(event, section.id)}
								aria-current={isActive ? "true" : undefined}
								className={cn(
									"block border-l-2 py-1 pl-3 text-sm transition-colors",
									isActive
										? "border-foreground font-medium text-foreground"
										: "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
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
