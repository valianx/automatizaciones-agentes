import { eventBus } from './lib/event-bus.js';
import { VMAgent } from './agents/vm-agent.js';
import { PostgreSQLAgent } from './agents/postgresql-agent.js';
import { RedisAgent } from './agents/redis-agent.js';
import { RabbitMQAgent } from './agents/rabbitmq-agent.js';
import { NodeJSAgent } from './agents/nodejs-agent.js';
import { PnpmAgent } from './agents/pnpm-agent.js';
import { SSHConfigAgent } from './agents/ssh-agent.js';
import type { AgentStatus } from './lib/types.js';

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

    async run(): Promise<void> {
        this.running = true;

        try {
            this.emit('Iniciando provisioning de infraestructura...', 'running', 0);

            // ═══════════════════════════════════════════════════
            // FASE 1: VM Agent (BLOQUEANTE — debe completar antes de continuar)
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
            // FASE 2: Resource Agents (TODOS EN PARALELO)
            // ═══════════════════════════════════════════════════
            this.emit('Fase 2: Lanzando 6 agentes de recursos en paralelo...', undefined, 40);

            const resourceAgents = [
                new PostgreSQLAgent(),
                new RedisAgent(),
                new RabbitMQAgent(),
                new NodeJSAgent(),
                new PnpmAgent(),
                new SSHConfigAgent(),
            ];

            const results = await Promise.allSettled(
                resourceAgents.map(agent => agent.run())
            );

            // ═══════════════════════════════════════════════════
            // RESUMEN FINAL
            // ═══════════════════════════════════════════════════
            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected');

            if (failed.length > 0) {
                const failedNames = failed.map((r, i) => resourceAgents[i]?.id).join(', ');
                this.emit(
                    `Provisioning completado con ${failed.length} error(es): ${failedNames}. ${succeeded}/6 exitosos.`,
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
