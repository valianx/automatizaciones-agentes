import { eventBus } from './lib/event-bus.js';
import { VMAgent } from './agents/vm-agent.js';
import { PostgreSQLAgent } from './agents/postgresql-agent.js';
import { RedisAgent } from './agents/redis-agent.js';
import { RabbitMQAgent } from './agents/rabbitmq-agent.js';
import { NodeJSAgent } from './agents/nodejs-agent.js';
import { PnpmAgent } from './agents/pnpm-agent.js';
import { SSHConfigAgent } from './agents/ssh-agent.js';
import { DockerAgent } from './agents/docker-agent.js';
import type { AgentId, AgentStatus } from './lib/types.js';

const MAX_ROUNDS = 3;

interface ManagedAgent {
    id: AgentId;
    name: string;
    factory: () => { id: AgentId; run(): Promise<boolean> };
    dependsOn?: AgentId;
}

export class Orchestrator {
    private running = false;

    isRunning(): boolean {
        return this.running;
    }

    private emit(message: string, status?: AgentStatus, progress?: number) {
        eventBus.emitEvent({
            agentId: 'orchestrator',
            type: status ? 'status' : 'log',
            status,
            message,
            progress,
            timestamp: Date.now(),
        });
    }

    private emitAgent(agentId: AgentId, message: string, status?: AgentStatus, progress?: number) {
        eventBus.emitEvent({
            agentId,
            type: status ? 'status' : 'log',
            status,
            message,
            progress,
            timestamp: Date.now(),
        });
    }

    async run(): Promise<void> {
        this.running = true;

        try {
            this.emit('Iniciando provisioning de infraestructura...', 'running', 0);

            // ═══════════════════════════════════════════════════
            // FASE 1: VM Agent (BLOQUEANTE)
            // ═══════════════════════════════════════════════════
            this.emit('Fase 1: Creando maquina virtual...', undefined, 5);
            const vmAgent = new VMAgent();

            try {
                await vmAgent.run();
            } catch (err: any) {
                this.emit(`Fallo en la creacion de VM: ${err.message}`, 'error');
                return;
            }

            // ═══════════════════════════════════════════════════
            // FASE 2: Resource Agents con reintentos
            // ═══════════════════════════════════════════════════
            this.emit('Fase 2: Lanzando agentes de recursos...', undefined, 40);

            const agents: ManagedAgent[] = [
                { id: 'postgresql', name: 'PostgreSQL', factory: () => new PostgreSQLAgent() },
                { id: 'redis', name: 'Redis', factory: () => new RedisAgent() },
                { id: 'rabbitmq', name: 'RabbitMQ', factory: () => new RabbitMQAgent() },
                { id: 'nodejs', name: 'Node.js', factory: () => new NodeJSAgent() },
                { id: 'ssh-config', name: 'SSH Config', factory: () => new SSHConfigAgent() },
                { id: 'docker', name: 'Docker', factory: () => new DockerAgent() },
                { id: 'pnpm', name: 'pnpm', factory: () => new PnpmAgent(), dependsOn: 'nodejs' },
            ];

            // Reactive model: each agent gets a deferred promise.
            // Dependent agents await their dependency's promise instead of waiting for the entire round.
            const deferreds = new Map<AgentId, { resolve: (ok: boolean) => void; promise: Promise<boolean> }>();
            for (const agent of agents) {
                let resolve!: (ok: boolean) => void;
                const promise = new Promise<boolean>(r => { resolve = r; });
                deferreds.set(agent.id, { resolve, promise });
            }

            const tasks = agents.map(async ({ id, name, factory, dependsOn }) => {
                // Wait for dependency to complete (resolves instantly for independent agents)
                if (dependsOn) {
                    const depOk = await deferreds.get(dependsOn)!.promise;
                    if (!depOk) {
                        this.emitAgent(id, `${name}: no se ejecuto (${dependsOn} no esta disponible)`, 'error');
                        deferreds.get(id)!.resolve(false);
                        return;
                    }
                }

                // Retry loop per agent
                for (let round = 1; round <= MAX_ROUNDS; round++) {
                    if (round > 1) {
                        this.emitAgent(id, `${name}: reintentando (ronda ${round}/${MAX_ROUNDS})...`);
                    }
                    try {
                        const agent = factory();
                        const ok = await agent.run();
                        if (ok) {
                            deferreds.get(id)!.resolve(true);
                            this.emitAgent(id, `${name} completado`, 'success', 100);
                            return;
                        }
                        if (round < MAX_ROUNDS) {
                            this.emitAgent(id, `${name}: verificacion no exitosa (ronda ${round})`);
                        }
                    } catch (err: any) {
                        if (round < MAX_ROUNDS) {
                            this.emitAgent(id, `${name}: error - ${err.message}`);
                        } else {
                            this.emitAgent(id, `${name}: error - ${err.message}`, 'error');
                        }
                    }
                }

                // All rounds exhausted
                deferreds.get(id)!.resolve(false);
                this.emitAgent(id, `${name}: fallo tras ${MAX_ROUNDS} intentos`, 'error');
            });

            await Promise.allSettled(tasks);

            // ═══════════════════════════════════════════════════
            // RESUMEN FINAL
            // ═══════════════════════════════════════════════════
            const verified = new Set<AgentId>();
            for (const [id, { promise }] of deferreds) {
                if (await promise) verified.add(id);
            }
            const failedAgents = agents.filter(a => !verified.has(a.id));

            if (failedAgents.length > 0) {
                const failedNames = failedAgents.map(a => a.name).join(', ');
                this.emit(
                    `Provisioning completado con ${failedAgents.length} error(es): ${failedNames}. ${verified.size}/${agents.length} exitosos.`,
                    'error',
                    100,
                );
            } else {
                this.emit(
                    'Todos los recursos provisionados exitosamente! VM lista para usar.',
                    'success',
                    100,
                );
            }
        } finally {
            this.running = false;
        }
    }

    async destroy(): Promise<void> {
        this.running = true;
        try {
            this.emit('Destruyendo infraestructura...', 'running', 0);
            const vmAgent = new VMAgent();
            await vmAgent.destroy();
            this.emit('Infraestructura destruida', 'success', 100);
        } catch (err: any) {
            this.emit(`Error al destruir: ${err.message}`, 'error');
        } finally {
            this.running = false;
        }
    }
}
