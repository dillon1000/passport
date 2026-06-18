import type { RouteObject } from "react-router";

import { AdminAudit } from "@/pages/AdminAudit";
import { Account } from "@/pages/Account";
import { AdminUsers } from "@/pages/AdminUsers";
import { Applications } from "@/pages/Applications";
import { AgentApprove } from "@/pages/AgentApprove";
import { Agents } from "@/pages/Agents";
import { AuthError } from "@/pages/AuthError";
import { Consent } from "@/pages/Consent";
import { OrganizationInvitation } from "@/pages/OrganizationInvitation";
import { Organizations } from "@/pages/Organizations";
import { Security } from "@/pages/Security";
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
		path: "/account",
		element: <Account />,
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
		path: "/auth/error",
		element: <AuthError />,
	},
	{
		path: "*",
		element: <SignIn />,
	},
] satisfies RouteObject[];
