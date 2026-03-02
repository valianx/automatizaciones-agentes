import { eventBus } from '../lib/event-bus.js';
import { createSSHConnection, runSSH } from '../lib/ssh-client.js';
import type { AgentId, AgentStatus } from '../lib/types.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class PnpmAgent {
    readonly id: AgentId = 'pnpm';

    private emit(message: string, status?: AgentStatus, progress?: number) {
        eventBus.emitEvent({
            agentId: this.id,
            type: status ? 'status' : 'log',
            status,
            message,
            progress,
            timestamp: Date.now(),
        });
    }

    async run(): Promise<void> {
        this.emit('Esperando a que Node.js este disponible...', 'running', 0);
        const ssh = await createSSHConnection();

        try {
            // Polling: esperar a que Node.js esté instalado (max 120s)
            const deadline = Date.now() + 120_000;
            let nodeReady = false;
            while (Date.now() < deadline) {
                const { code } = await runSSH(ssh, 'which node');
                if (code === 0) {
                    nodeReady = true;
                    break;
                }
                this.emit('Node.js aun no disponible, esperando 5s...');
                await sleep(5000);
            }

            if (!nodeReady) {
                throw new Error('Timeout: Node.js no se instalo en 120 segundos');
            }

            this.emit('Node.js detectado. Habilitando corepack...', undefined, 30);
            await runSSH(ssh, 'sudo corepack enable', (line) => {
                if (line) this.emit(line);
            });

            this.emit('Instalando pnpm via corepack...', undefined, 60);
            await runSSH(ssh, 'sudo corepack prepare pnpm@latest --activate', (line) => {
                if (line) this.emit(line);
            });

            this.emit('Verificando instalacion...', undefined, 85);
            const { stdout } = await runSSH(ssh, 'pnpm --version');

            this.emit(`pnpm listo: v${stdout.trim()}`, 'success', 100);
        } catch (err: any) {
            this.emit(`Error: ${err.message}`, 'error');
            throw err;
        } finally {
            ssh.dispose();
        }
    }
}
