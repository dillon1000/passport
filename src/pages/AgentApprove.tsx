import { useState, type FormEvent } from "react";
import { Bot, ShieldCheck, X } from "lucide-react";

import { authClient } from "@/auth-client";
import { AuthShell } from "@/components/auth/auth-shell";
import { BrandMark } from "@/components/auth/brand-mark";
import { Field, FieldInput, FieldTextarea } from "@/components/auth/field";
import { StatusBanner, type Status } from "@/components/auth/status";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

type AgentApprovalAction = "approve" | "deny";

type AgentApprovalClient = {
	agent: {
		approveCapability: (input: {
			agent_id?: string;
			approval_id?: string;
			user_code?: string;
			action: AgentApprovalAction;
			capabilities?: string[];
			reason?: string;
		}) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
	};
};

function capabilityList(value: string) {
	return value
		.split(/[,\s]+/)
		.map((item) => item.trim())
		.filter(Boolean);
}

export function AgentApprove() {
	const searchParams = new URLSearchParams(window.location.search);
	const [agentId, setAgentId] = useState(searchParams.get("agent_id") ?? "");
	const [approvalId, setApprovalId] = useState(searchParams.get("approval_id") ?? "");
	const [userCode, setUserCode] = useState(searchParams.get("user_code") ?? "");
	const [capabilities, setCapabilities] = useState(searchParams.get("capabilities") ?? "");
	const [reason, setReason] = useState("");
	const [busy, setBusy] = useState<AgentApprovalAction | null>(null);
	const [status, setStatus] = useState<Status | null>(null);

	async function decide(action: AgentApprovalAction) {
		setBusy(action);
		setStatus(null);
		const agentClient = authClient as unknown as AgentApprovalClient;
		const result = await agentClient.agent.approveCapability({
			agent_id: agentId || undefined,
			approval_id: approvalId || undefined,
			user_code: userCode || undefined,
			action,
			capabilities: capabilityList(capabilities),
			reason: reason || undefined,
		});
		setBusy(null);
		setStatus(
			result.error
				? { tone: "error", message: result.error.message ?? "Could not update agent approval." }
				: {
						tone: "success",
						message: action === "approve" ? "Agent request approved." : "Agent request denied.",
					},
		);
	}

	function submitApproval(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		void decide("approve");
	}

	return (
		<AuthShell>
			<div className="flex flex-col items-center gap-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<BrandMark className="size-10 rounded-lg" />
					<h1 className="text-xl font-semibold tracking-tight">Approve agent access</h1>
				</div>

				<Card className="w-full">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-lg tracking-tight">
							<Bot className="size-5" />
							Agent Auth request
						</CardTitle>
						<CardDescription>
							Approve or deny a pending Agent Auth device authorization or capability request.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form id="agent-approval-form" className="space-y-4" onSubmit={submitApproval}>
							<StatusBanner status={status} />
							<div className="grid gap-4 sm:grid-cols-2">
								<Field label="Agent ID">
									<FieldInput
										value={agentId}
										onChange={(event) => setAgentId(event.target.value)}
										placeholder="agent_..."
									/>
								</Field>
								<Field label="Approval ID">
									<FieldInput
										value={approvalId}
										onChange={(event) => setApprovalId(event.target.value)}
										placeholder="approval_..."
									/>
								</Field>
							</div>
							<Field label="User code" hint="Required for device authorization approvals.">
								<FieldInput
									value={userCode}
									onChange={(event) => setUserCode(event.target.value.toUpperCase())}
									placeholder="ABCD-1234"
								/>
							</Field>
							<Field label="Capabilities" hint="Optional comma or space separated allow-list.">
								<FieldInput
									value={capabilities}
									onChange={(event) => setCapabilities(event.target.value)}
									placeholder="get_service_metadata"
								/>
							</Field>
							<Field label="Reason">
								<FieldTextarea
									value={reason}
									onChange={(event) => setReason(event.target.value)}
									placeholder="Optional note for denial or audit context."
								/>
							</Field>
						</form>
					</CardContent>
					<CardFooter className="grid grid-cols-2 gap-2 border-t bg-muted/40">
						<Button
							variant="outline"
							type="button"
							onClick={() => decide("deny")}
							disabled={busy !== null || (!agentId && !approvalId)}
						>
							<X className="size-4" />
							Deny
						</Button>
						<Button
							type="submit"
							form="agent-approval-form"
							disabled={busy !== null || (!agentId && !approvalId)}
						>
							<ShieldCheck className="size-4" />
							Approve
						</Button>
					</CardFooter>
				</Card>
			</div>
		</AuthShell>
	);
}
