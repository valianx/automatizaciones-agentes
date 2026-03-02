import { eventBus } from '../lib/event-bus.js';
import { createSSHConnection, runSSH } from '../lib/ssh-client.js';
import type { AgentId, AgentStatus } from '../lib/types.js';

export class RabbitMQAgent {
    readonly id: AgentId = 'rabbitmq';

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
        this.emit('Iniciando instalacion de RabbitMQ...', 'running', 0);
        const ssh = await createSSHConnection();

        try {
            this.emit('Instalando Erlang...', undefined, 10);
            await runSSH(ssh, 'sudo DEBIAN_FRONTEND=noninteractive apt-get install -y erlang-base erlang-nox', (line) => {
                if (line) this.emit(line);
            });

            this.emit('Instalando RabbitMQ server...', undefined, 35);
            await runSSH(ssh, 'sudo DEBIAN_FRONTEND=noninteractive apt-get install -y rabbitmq-server', (line) => {
                if (line) this.emit(line);
            });

            this.emit('Habilitando management plugin...', undefined, 55);
            await runSSH(ssh, 'sudo rabbitmq-plugins enable rabbitmq_management');

            this.emit('Creando usuario admin...', undefined, 70);
            await runSSH(ssh, 'sudo rabbitmqctl add_user admin admin');
            await runSSH(ssh, 'sudo rabbitmqctl set_user_tags admin administrator');
            await runSSH(ssh, 'sudo rabbitmqctl set_permissions -p / admin ".*" ".*" ".*"');

            this.emit('Reiniciando servicio...', undefined, 85);
            await runSSH(ssh, 'sudo systemctl restart rabbitmq-server');
            await runSSH(ssh, 'sudo systemctl enable rabbitmq-server');

            this.emit('Verificando instalacion...', undefined, 95);
            const { stdout } = await runSSH(ssh, 'sudo rabbitmqctl status | head -3');

            this.emit(`RabbitMQ listo (management UI en :15672). ${stdout.trim()}`, 'success', 100);
        } catch (err: any) {
            this.emit(`Error: ${err.message}`, 'error');
            throw err;
        } finally {
            ssh.dispose();
        }
    }
}
