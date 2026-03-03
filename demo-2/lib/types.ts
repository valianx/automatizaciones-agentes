export const RESOURCE_AGENT_IDS = [
    'postgresql', 'redis', 'rabbitmq', 'nodejs', 'pnpm', 'ssh-config', 'docker',
] as const;

export type ResourceAgentId = typeof RESOURCE_AGENT_IDS[number];

export type AgentId = 'orchestrator' | 'vm' | ResourceAgentId;

export type AgentStatus = 'idle' | 'running' | 'success' | 'error';

export function isResourceAgentId(id: string): id is ResourceAgentId {
    return (RESOURCE_AGENT_IDS as readonly string[]).includes(id);
}

export interface AgentEvent {
    agentId: AgentId;
    type: 'status' | 'log';
    status?: AgentStatus | undefined;
    message: string;
    timestamp: number;
    progress?: number | undefined; // 0-100
    tokenUsage?: { inputTokens: number; outputTokens: number } | undefined;
}
