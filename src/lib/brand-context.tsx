import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";

import { brand } from "@/lib/brand";
import { BrandContext, type BrandConfig, type BrandTheme } from "@/lib/brand-runtime";
import { fetchAPIJSON, queryKeys } from "@/lib/query-client";

const defaultBrand = brand as BrandConfig;

const THEME_VARIABLES: Record<keyof BrandTheme, string> = {
	brand: "--brand",
	brandForeground: "--brand-foreground",
	primary: "--primary",
	primaryForeground: "--primary-foreground",
	ring: "--ring",
};

export function BrandProvider({ children }: { children: ReactNode }) {
	const { data: currentBrand = defaultBrand } = useQuery<BrandConfig>({
		queryKey: queryKeys.brandConfig(),
		queryFn: async () => {
			try {
				return await fetchAPIJSON<BrandConfig>("/api/brand-config");
			} catch {
				return brand satisfies BrandConfig;
			}
		},
		staleTime: Number.POSITIVE_INFINITY,
	});

	useEffect(() => {
		for (const [key, variable] of Object.entries(THEME_VARIABLES) as [
			keyof BrandTheme,
			string,
		][]) {
			const value = currentBrand.theme?.[key];
			if (value) document.documentElement.style.setProperty(variable, value);
		}
	}, [currentBrand]);

	return <BrandContext value={currentBrand}>{children}</BrandContext>;
}
