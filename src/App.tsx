import { useRoutes } from "react-router";

import { appRoutes } from "@/routes";

import "./App.css";

function App() {
	return useRoutes(appRoutes);
}

export default App;
