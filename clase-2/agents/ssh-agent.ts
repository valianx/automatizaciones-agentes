import { eventBus } from '../lib/event-bus.js';
import { createSSHConnection, runSSH } from '../lib/ssh-client.js';
import type { AgentId, AgentStatus } from '../lib/types.js';

export class SSHConfigAgent {
    readonly id: AgentId = 'ssh-config';

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
        this.emit('Configurando SSH sin autenticacion por password...', 'running', 0);
        const ssh = await createSSHConnection();

        try {
            this.emit('Generando par de llaves SSH...', undefined, 15);
            await runSSH(ssh, 'sudo test -f /home/vagrant/.ssh/id_rsa || sudo -u vagrant ssh-keygen -t rsa -b 4096 -f /home/vagrant/.ssh/id_rsa -N ""');

            this.emit('Desactivando autenticacion por password...', undefined, 35);
            await runSSH(ssh, "sudo sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config");
            await runSSH(ssh, "sudo sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config");

            this.emit('Habilitando solo autenticacion por llave publica...', undefined, 55);
            await runSSH(ssh, "sudo sed -i 's/^#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config");
            await runSSH(ssh, "sudo sed -i 's/^#ChallengeResponseAuthentication yes/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config");
            await runSSH(ssh, "sudo sed -i 's/^ChallengeResponseAuthentication yes/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config");

            this.emit('Reiniciando servicio SSH...', undefined, 75);
            await runSSH(ssh, 'sudo systemctl restart sshd');

            this.emit('Verificando configuracion...', undefined, 90);
            const { stdout } = await runSSH(ssh, 'sudo sshd -T | grep -E "passwordauthentication|pubkeyauthentication"');

            this.emit(`SSH configurado: ${stdout.trim().replace(/\n/g, ', ')}`, 'success', 100);
        } catch (err: any) {
            this.emit(`Error: ${err.message}`, 'error');
            throw err;
        } finally {
            ssh.dispose();
        }
    }
}
