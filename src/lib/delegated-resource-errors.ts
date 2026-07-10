/**
 * Stable errors emitted by delegated resource services. HTTP routers may expose
 * the code and message directly and use status to choose the response class.
 */
export class DelegatedResourceError extends Error {
	readonly code: string;
	readonly status: number;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.name = "DelegatedResourceError";
		this.status = status;
		this.code = code;
	}
}

export function delegatedBadRequest(code: string, message: string) {
	return new DelegatedResourceError(400, code, message);
}

export function delegatedForbidden(code: string, message: string) {
	return new DelegatedResourceError(403, code, message);
}

export function delegatedNotFound(code: string, message: string) {
	return new DelegatedResourceError(404, code, message);
}

export function delegatedConflict(code: string, message: string) {
	return new DelegatedResourceError(409, code, message);
}
