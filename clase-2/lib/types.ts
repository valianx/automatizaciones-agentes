export type AgentId =
    | 'orchestrator'
    | 'vm'
    | 'postgresql'
    | 'redis'
    | 'rabbitmq'
    | 'nodejs'
    | 'pnpm'
    | 'ssh-config';

export type AgentStatus = 'idle' | 'running' | 'success' | 'error';

export interface AgentEvent {
    agentId: AgentId;
    type: 'status' | 'log';
    status?: AgentStatus;
    message: string;
    timestamp: number;
    progress?: number; // 0-100
}
