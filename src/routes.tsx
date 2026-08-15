import type { RouteObject } from "react-router";

import { About } from "@/pages/About";
import { ScratchShell } from "@/pages/__ScratchShell";
import { AdminAudit } from "@/pages/AdminAudit";
import { Account } from "@/pages/Account";
import { AdminUsers } from "@/pages/AdminUsers";
import { Applications } from "@/pages/Applications";
import { AgentApprove } from "@/pages/AgentApprove";
import { Agents } from "@/pages/Agents";
import { AuthError } from "@/pages/AuthError";
import { Billing } from "@/pages/billing/Billing";
import { BillingAction } from "@/pages/billing/Action";
import { Product } from "@/pages/billing/Product";
import { Consent } from "@/pages/Consent";
import { Legal } from "@/pages/Legal";
import { NoWebAssembly } from "@/pages/NoWebAssembly";
import { NotFound } from "@/pages/NotFound";
import { OrganizationInvitation } from "@/pages/OrganizationInvitation";
import { Organizations } from "@/pages/Organizations";
import { Security } from "@/pages/Security";
import { SelectAccount } from "@/pages/SelectAccount";
import { Sessions } from "@/pages/Sessions";
import { Settings } from "@/pages/Settings";
import { SignIn } from "@/pages/SignIn";
import { TwoFactor } from "@/pages/TwoFactor";
import { Webhooks } from "@/pages/Webhooks";

export const appRoutes = [
	{
		path: "/",
		element: <SignIn />,
	},
	{
		path: "/sign-in",
		element: <SignIn />,
	},
	{
		path: "/about",
		element: <About />,
	},
	{
		path: "/__scratch",
		element: <ScratchShell />,
	},
	{
		path: "/account",
		element: <Account />,
	},
	{
		path: "/billing/product/:productId",
		element: <Product />,
	},
	{
		path: "/billing/action/:intentId",
		element: <BillingAction />,
	},
	{
		path: "/billing/*",
		element: <Billing />,
	},
	{
		path: "/security",
		element: <Security />,
	},
	{
		path: "/sessions",
		element: <Sessions />,
	},
	{
		path: "/settings",
		element: <Settings />,
	},
	{
		path: "/organizations",
		element: <Organizations />,
	},
	{
		path: "/organization/invitation",
		element: <OrganizationInvitation />,
	},
	{
		path: "/applications",
		element: <Applications />,
	},
	{
		path: "/agents",
		element: <Agents />,
	},
	{
		path: "/agent/approve",
		element: <AgentApprove />,
	},
	{
		path: "/admin/users",
		element: <AdminUsers />,
	},
	{
		path: "/admin/audit",
		element: <AdminAudit />,
	},
	{
		path: "/admin/webhooks",
		element: <Webhooks />,
	},
	{
		path: "/two-factor",
		element: <TwoFactor />,
	},
	{
		path: "/consent",
		element: <Consent />,
	},
	{
		path: "/privacy",
		element: <Legal policy="privacy" />,
	},
	{
		path: "/terms",
		element: <Legal policy="terms" />,
	},
	{
		path: "/select-account",
		element: <SelectAccount />,
	},
	{
		path: "/auth/error",
		element: <AuthError />,
	},
	{
		path: "/error/no-webassembly",
		element: <NoWebAssembly />,
	},
	{
		path: "*",
		element: <NotFound />,
	},
] satisfies RouteObject[];
