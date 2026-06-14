import { useEffect, useState, type ReactNode } from "react";

import { brand } from "@/lib/brand";
import { BrandContext, type BrandConfig, type BrandTheme } from "@/lib/brand-runtime";

const THEME_VARIABLES: Record<keyof BrandTheme, string> = {
	brand: "--brand",
	brandForeground: "--brand-foreground",
	primary: "--primary",
	primaryForeground: "--primary-foreground",
	ring: "--ring",
};

export function BrandProvider({ children }: { children: ReactNode }) {
	const [currentBrand, setCurrentBrand] = useState<BrandConfig>(brand);

	useEffect(() => {
		let cancelled = false;
		async function loadBrand() {
			try {
				const response = await fetch("/api/brand-config");
				if (!response.ok) return;
				const config = (await response.json()) as BrandConfig;
				if (cancelled) return;
				setCurrentBrand(config);
				for (const [key, variable] of Object.entries(THEME_VARIABLES) as [
					keyof BrandTheme,
					string,
				][]) {
					const value = config.theme?.[key];
					if (value) document.documentElement.style.setProperty(variable, value);
				}
			} catch {
				// The default brand is usable when runtime config is unavailable.
			}
		}
		void loadBrand();
		return () => {
			cancelled = true;
		};
	}, []);

	return <BrandContext value={currentBrand}>{children}</BrandContext>;
}
