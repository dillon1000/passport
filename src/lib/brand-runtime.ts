import { createContext, use } from "react";

import { brand, type Brand } from "@/lib/brand";

export type BrandTheme = {
	brand?: string;
	brandForeground?: string;
	primary?: string;
	primaryForeground?: string;
	ring?: string;
};

export type BrandConfig = Brand & {
	theme?: BrandTheme;
};

export const BrandContext = createContext<BrandConfig>(brand);

export function useBrand() {
	return use(BrandContext);
}
