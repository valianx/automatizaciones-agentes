import { eventBus } from '../lib/event-bus.js';
import { createSSHConnection, runSSH } from '../lib/ssh-client.js';
import type { AgentId, AgentStatus } from '../lib/types.js';

export class NodeJSAgent {
    readonly id: AgentId = 'nodejs';

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
        this.emit('Iniciando instalacion de Node.js...', 'running', 0);
        const ssh = await createSSHConnection();

        try {
            this.emit('Descargando setup de NodeSource (v22 LTS)...', undefined, 15);
            await runSSH(ssh, 'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -', (line) => {
                if (line) this.emit(line);
            });

            this.emit('Instalando Node.js...', undefined, 50);
            await runSSH(ssh, 'sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs', (line) => {
                if (line) this.emit(line);
            });

            this.emit('Verificando instalacion...', undefined, 85);
            const { stdout: nodeV } = await runSSH(ssh, 'node --version');
            const { stdout: npmV } = await runSSH(ssh, 'npm --version');

            this.emit(`Node.js listo: ${nodeV.trim()} / npm ${npmV.trim()}`, 'success', 100);
        } catch (err: any) {
            this.emit(`Error: ${err.message}`, 'error');
            throw err;
        } finally {
            ssh.dispose();
        }
    }
}
