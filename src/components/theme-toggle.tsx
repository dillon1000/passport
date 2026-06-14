import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

/** Light/dark switch. Icon reflects the theme you'll switch *to*. */
export function ThemeToggle() {
	const { theme, toggle } = useTheme();
	const next = theme === "dark" ? "light" : "dark";
	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={toggle}
			aria-label={`Switch to ${next} theme`}
			title={`Switch to ${next} theme`}
		>
			<Sun className="hidden size-4 dark:block" />
			<Moon className="size-4 dark:hidden" />
		</Button>
	);
}
