import { useRoutes } from "react-router";

import { AccountSwitchOverlay } from "@/components/auth/account-switch-overlay";
import { appRoutes } from "@/routes";

import "./App.css";

function App() {
	const routes = useRoutes(appRoutes);
	return <>{routes}<AccountSwitchOverlay /></>;
}

export default App;
