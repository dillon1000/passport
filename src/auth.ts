/**
 * Better Auth server entrypoint. Worker handlers call the exported factory with
 * real Cloudflare bindings, while the default export stays lazy so Better Auth
 * CLI schema tools can still discover auth configuration without doing
 * request-time work during module import.
 */
import { betterAuth } from "better-auth/minimal";

import { createDb } from "./db/client";
import type { AuthEnv } from "./env";
import { createAuthOptions } from "./lib/auth-server/config";
import { createCliAuthEnv } from "./lib/auth-server/env";

export { AUTH_ERROR_PATH } from "./lib/auth-error";
export { isAdminOperator, type AdminOperatorCandidate } from "./lib/admin-access";
export {
	AUTH_ADVANCED_OPTIONS,
	AUTH_SESSION_COOKIE_NAME,
	AUTH_SESSION_OPTIONS,
} from "./lib/auth-server/options";
export { isNewSignInIPAddress } from "./lib/auth-server/hooks";

function createAuthInstance(env: AuthEnv) {
	const db = createDb(env);

	return betterAuth(createAuthOptions(env, db));
}

type AuthInstance = ReturnType<typeof createAuthInstance>;
type AuthFactory = ((env: AuthEnv) => AuthInstance) & AuthInstance;

let cliAuthInstance: AuthInstance | undefined;

function getCliAuthInstance() {
	cliAuthInstance ??= createAuthInstance(createCliAuthEnv());
	return cliAuthInstance;
}

function getCliAuthProperty(property: string | symbol) {
	return Reflect.get(getCliAuthInstance() as object, property);
}

function lazyCliAuthInstance() {
	return new Proxy({} as AuthInstance, {
		get: (_target, property) => getCliAuthProperty(property),
		has: (_target, property) => property in getCliAuthInstance(),
		ownKeys: () => Reflect.ownKeys(getCliAuthInstance() as object),
		getOwnPropertyDescriptor: (_target, property) =>
			Reflect.getOwnPropertyDescriptor(getCliAuthInstance() as object, property),
	});
}

/**
 * Worker handlers call this with the real Cloudflare env. The attached proxy
 * keeps Better Auth CLI/default-export compatibility without constructing
 * plugin internals during Worker module validation.
 */
export const auth = new Proxy((env: AuthEnv) => createAuthInstance(env), {
	get: (target, property, receiver) => {
		if (property in target) {
			return Reflect.get(target, property, receiver);
		}
		return getCliAuthProperty(property);
	},
	has: (target, property) => property in target || property in getCliAuthInstance(),
	ownKeys: (target) => [
		...new Set([...Reflect.ownKeys(target), ...Reflect.ownKeys(getCliAuthInstance() as object)]),
	],
	getOwnPropertyDescriptor: (target, property) =>
		Reflect.getOwnPropertyDescriptor(target, property) ??
		Reflect.getOwnPropertyDescriptor(getCliAuthInstance() as object, property),
}) as AuthFactory;

export default lazyCliAuthInstance();
