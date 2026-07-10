/**
 * React Query provider for the browser app. It creates one QueryClient per app
 * mount so dashboard pages share server-state caches, request dedupe, mutation
 * invalidation, and conservative defaults from `query-client.ts`.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { createAppQueryClient } from "@/lib/query-client";

export function AppQueryProvider({ children }: { children: ReactNode }) {
	const [queryClient] = useState(createAppQueryClient);

	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
