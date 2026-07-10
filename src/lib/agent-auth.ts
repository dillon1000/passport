/**
 * Agent Auth browser helpers. Page components use these helpers for deterministic
 * parsing/status decisions and for a narrow typed facade over plugin methods
 * that are installed on the Better Auth client at runtime.
 */
import { authClient } from "@/auth-client";

type AgentAuthActionResult<T = unknown> = Promise<{
	data?: T;
	error?: { message?: string } | null;
}>;

export type AgentApprovalAction = "approve" | "deny";

export type AgentApprovalInput = {
	agentId?: string;
	approvalId?: string;
	userCode?: string;
	action: AgentApprovalAction;
	capabilities?: string[];
	reason?: string;
};

export type PendingAgentApproval = {
	approval_id: string;
	method: "device_authorization" | "ciba";
	agent_id: string | null;
	agent_name: string | null;
	binding_message: string | null;
	capabilities: string[];
	capability_reasons: Record<string, string> | null;
	expires_in: number;
	created_at: string | Date;
};

type AgentAuthRuntimeClient = {
	agent: {
		approveCapability: (input: {
			agent_id?: string;
			approval_id?: string;
			user_code?: string;
			action: AgentApprovalAction;
			capabilities?: string[];
			reason?: string;
		}) => AgentAuthActionResult<{ active: boolean }>;
		cibaPending: () => AgentAuthActionResult<{ requests: PendingAgentApproval[] }>;
		reactivateAgent: (input: { agent_id: string }) => AgentAuthActionResult;
		revokeAgent: (input: { agent_id: string }) => AgentAuthActionResult;
		revokeCapability: (input: {
			agent_id: string;
			capabilities: string[];
		}) => AgentAuthActionResult;
	};
	host: {
		revokeHost: (input: { host_id: string }) => AgentAuthActionResult;
	};
};

function agentAuthClient() {
	// Better Auth plugin methods are installed at runtime. This narrow facade is
	// the single bridge for methods that the local generated client type may not
	// expose directly after plugin composition.
	return authClient as unknown as AgentAuthRuntimeClient;
}

export function parseCapabilityList(value: string) {
	return value
		.split(/[,\s]+/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function optionalTrimmed(value?: string) {
	const trimmed = value?.trim();
	return trimmed || undefined;
}

export function normalizeAgentApprovalInput(input: AgentApprovalInput): AgentApprovalInput {
	const capabilities = input.capabilities
		?.map((capability) => capability.trim())
		.filter(Boolean);

	return {
		agentId: optionalTrimmed(input.agentId),
		approvalId: optionalTrimmed(input.approvalId),
		userCode: optionalTrimmed(input.userCode),
		action: input.action,
		capabilities: capabilities?.length ? capabilities : undefined,
		reason: optionalTrimmed(input.reason),
	};
}

export function canRevokeAgentStatus(status: string) {
	return ["active", "pending"].includes(status.toLowerCase());
}

export function canReactivateAgentStatus(status: string) {
	return status.toLowerCase() === "expired";
}

export function canRevokeGrantStatus(status: string) {
	return ["active", "granted", "pending"].includes(status.toLowerCase());
}

export async function approveAgentCapability(input: AgentApprovalInput) {
	const normalized = normalizeAgentApprovalInput(input);
	return agentAuthClient().agent.approveCapability({
		agent_id: normalized.agentId,
		approval_id: normalized.approvalId,
		user_code: normalized.userCode,
		action: normalized.action,
		capabilities: normalized.capabilities,
		reason: normalized.reason,
	});
}

export async function loadPendingAgentApprovals() {
	return agentAuthClient().agent.cibaPending();
}

export async function revokeAgent(agentId: string) {
	return agentAuthClient().agent.revokeAgent({ agent_id: agentId });
}

export async function reactivateAgent(agentId: string) {
	return agentAuthClient().agent.reactivateAgent({ agent_id: agentId });
}

export async function revokeAgentCapability(agentId: string, capability: string) {
	return agentAuthClient().agent.revokeCapability({
		agent_id: agentId,
		capabilities: [capability],
	});
}

export async function revokeHost(hostId: string) {
	return agentAuthClient().host.revokeHost({ host_id: hostId });
}
