import { eventBus } from '../lib/event-bus.js';
import { createSSHConnection, runSSH } from '../lib/ssh-client.js';
import type { AgentId, AgentStatus } from '../lib/types.js';

export class RedisAgent {
    readonly id: AgentId = 'redis';

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
        this.emit('Iniciando instalacion de Redis...', 'running', 0);
        const ssh = await createSSHConnection();

        try {
            this.emit('Instalando redis-server...', undefined, 15);
            await runSSH(ssh, 'sudo DEBIAN_FRONTEND=noninteractive apt-get install -y redis-server', (line) => {
                if (line) this.emit(line);
            });

            this.emit('Configurando bind a todas las interfaces...', undefined, 50);
            await runSSH(ssh, "sudo sed -i 's/^bind 127.0.0.1.*/bind 0.0.0.0/' /etc/redis/redis.conf");
            await runSSH(ssh, "sudo sed -i 's/^protected-mode yes/protected-mode no/' /etc/redis/redis.conf");

            this.emit('Reiniciando servicio...', undefined, 70);
            await runSSH(ssh, 'sudo systemctl restart redis-server');
            await runSSH(ssh, 'sudo systemctl enable redis-server');

            this.emit('Verificando instalacion...', undefined, 90);
            const { stdout } = await runSSH(ssh, 'redis-cli ping');

            this.emit(`Redis listo: ${stdout.trim()}`, 'success', 100);
        } catch (err: any) {
            this.emit(`Error: ${err.message}`, 'error');
            throw err;
        } finally {
            ssh.dispose();
        }
    }
}
