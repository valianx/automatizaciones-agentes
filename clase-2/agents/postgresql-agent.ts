import { eventBus } from '../lib/event-bus.js';
import { createSSHConnection, runSSH } from '../lib/ssh-client.js';
import type { AgentId, AgentStatus } from '../lib/types.js';

export class PostgreSQLAgent {
    readonly id: AgentId = 'postgresql';

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
        this.emit('Iniciando instalacion de PostgreSQL...', 'running', 0);
        const ssh = await createSSHConnection();

        try {
            this.emit('Instalando PostgreSQL...', undefined, 15);
            await runSSH(ssh, 'sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib', (line) => {
                if (line) this.emit(line);
            });

            this.emit('Configurando acceso remoto...', undefined, 50);
            // Detectar version de PostgreSQL instalada
            const { stdout: pgVersion } = await runSSH(ssh, "ls /etc/postgresql/");
            const version = pgVersion.trim().split('\n')[0]?.trim() || '16';

            await runSSH(ssh, `sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/${version}/main/postgresql.conf`);
            await runSSH(ssh, `echo "host all all 0.0.0.0/0 md5" | sudo tee -a /etc/postgresql/${version}/main/pg_hba.conf`);

            this.emit('Creando usuario con password...', undefined, 65);
            await runSSH(ssh, `sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"`);

            this.emit('Reiniciando servicio...', undefined, 80);
            await runSSH(ssh, 'sudo systemctl restart postgresql');
            await runSSH(ssh, 'sudo systemctl enable postgresql');

            this.emit('Verificando instalacion...', undefined, 90);
            const { stdout } = await runSSH(ssh, 'sudo -u postgres psql -c "SELECT version();"');
            const versionLine = stdout.split('\n').find(l => l.includes('PostgreSQL'))?.trim() || 'PostgreSQL instalado';

            this.emit(`PostgreSQL listo: ${versionLine}`, 'success', 100);
        } catch (err: any) {
            this.emit(`Error: ${err.message}`, 'error');
            throw err;
        } finally {
            ssh.dispose();
        }
    }
}
