import { useEffect, useState, type FormEvent } from "react";
import { Bot, ShieldCheck, X } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Wordmark } from "@/components/auth/wordmark";
import { Field, FieldInput, FieldTextarea } from "@/components/auth/field";
import { StatusBanner, type Status } from "@/components/auth/status";
import {
	approveAgentCapability,
	loadPendingAgentApprovals,
	parseCapabilityList,
	type AgentApprovalAction,
	type PendingAgentApproval,
} from "@/lib/agent-auth";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export function AgentApprove() {
	const searchParams = new URLSearchParams(window.location.search);
	const [agentId, setAgentId] = useState(searchParams.get("agent_id") ?? "");
	const [approvalId, setApprovalId] = useState(searchParams.get("approval_id") ?? "");
	const [userCode, setUserCode] = useState(searchParams.get("user_code") ?? "");
	const [capabilities, setCapabilities] = useState(searchParams.get("capabilities") ?? "");
	const [reason, setReason] = useState("");
	const [pendingApprovals, setPendingApprovals] = useState<PendingAgentApproval[]>([]);
	const [pendingLoaded, setPendingLoaded] = useState(false);
	const [busy, setBusy] = useState<AgentApprovalAction | null>(null);
	const [status, setStatus] = useState<Status | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function loadPending() {
			const result = await loadPendingAgentApprovals();
			if (cancelled) return;
			if (result.data?.requests) setPendingApprovals(result.data.requests);
			setPendingLoaded(true);
		}
		void loadPending().catch(() => {
			if (!cancelled) setPendingLoaded(true);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	function applyPendingApproval(approval: PendingAgentApproval) {
		setApprovalId(approval.approval_id);
		setAgentId(approval.agent_id ?? "");
		setCapabilities(approval.capabilities.join(" "));
		const reasons = Object.values(approval.capability_reasons ?? {}).filter(Boolean);
		setReason(reasons[0] ?? approval.binding_message ?? "");
	}

	async function decide(action: AgentApprovalAction) {
		setBusy(action);
		setStatus(null);
		try {
			const result = await approveAgentCapability({
				agentId,
				approvalId,
				userCode,
				action,
				capabilities: parseCapabilityList(capabilities),
				reason: reason || undefined,
			});
			setStatus(
				result.error
					? { tone: "error", message: result.error.message ?? "Could not update agent approval." }
					: {
							tone: "success",
							message: action === "approve" ? "Agent request approved." : "Agent request denied.",
						},
			);
		} catch (error) {
			setStatus({
				tone: "error",
				message: error instanceof Error ? error.message : "Could not update agent approval.",
			});
		} finally {
			setBusy(null);
		}
	}

	function submitApproval(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		void decide("approve");
	}

	return (
		<AuthShell>
			<div className="flex flex-col items-center gap-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<Wordmark className="h-7" />
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
							{pendingLoaded && pendingApprovals.length ? (
								<div className="space-y-2 rounded-lg border bg-muted/20 p-3">
									<div className="text-xs font-medium text-muted-foreground">
										Pending approvals
									</div>
									<div className="space-y-2">
										{pendingApprovals.map((approval) => (
											<button
												key={approval.approval_id}
												type="button"
												onClick={() => applyPendingApproval(approval)}
												className="w-full rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:bg-muted"
											>
												<div className="flex flex-wrap items-center gap-2 text-sm font-medium">
													<span>{approval.agent_name ?? approval.agent_id ?? "Agent request"}</span>
													<span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
														{approval.method}
													</span>
												</div>
												<div className="mt-1 flex flex-wrap gap-1">
													{approval.capabilities.map((capability) => (
														<span
															key={`${approval.approval_id}:${capability}`}
															className="rounded-md border px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground"
														>
															{capability}
														</span>
													))}
												</div>
												{approval.binding_message ? (
													<p className="mt-1 text-xs text-muted-foreground">
														{approval.binding_message}
													</p>
												) : null}
											</button>
										))}
									</div>
								</div>
							) : null}
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
							disabled={busy !== null || (!agentId && !approvalId && !userCode)}
						>
							<X className="size-4" />
							Deny
						</Button>
						<Button
							type="submit"
							form="agent-approval-form"
							disabled={busy !== null || (!agentId && !approvalId && !userCode)}
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
