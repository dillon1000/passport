import type { RouteObject } from "react-router";

import { Account } from "@/pages/Account";
import { Applications } from "@/pages/Applications";
import { AgentApprove } from "@/pages/AgentApprove";
import { Agents } from "@/pages/Agents";
import { Consent } from "@/pages/Consent";
import { Organizations } from "@/pages/Organizations";
import { Security } from "@/pages/Security";
import { Sessions } from "@/pages/Sessions";
import { SignIn } from "@/pages/SignIn";
import { TwoFactor } from "@/pages/TwoFactor";

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
		path: "/organizations",
		element: <Organizations />,
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
		path: "/two-factor",
		element: <TwoFactor />,
	},
	{
		path: "/consent",
		element: <Consent />,
	},
	{
		path: "*",
		element: <SignIn />,
	},
] satisfies RouteObject[];
