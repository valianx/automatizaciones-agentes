import { spawn } from 'child_process';
import { eventBus } from '../lib/event-bus.js';
import { createSSHConnection, runSSH } from '../lib/ssh-client.js';
import type { AgentId, AgentStatus } from '../lib/types.js';

export class VMAgent {
    readonly id: AgentId = 'vm';

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
        this.emit('Iniciando vagrant up...', 'running', 0);

        await this.vagrantUp();

        // Actualizar paquetes del sistema después de levantar la VM
        this.emit('VM lista. Actualizando paquetes del sistema...', undefined, 75);
        await this.updatePackages();

        this.emit('VM lista y paquetes actualizados. SSH accesible.', 'success', 100);
    }

    async destroy(): Promise<void> {
        this.emit('Destruyendo VM...', 'running', 0);
        await this.vagrantCommand(['destroy', '-f']);
        this.emit('VM destruida', 'success', 100);
    }

    private async updatePackages(): Promise<void> {
        const ssh = await createSSHConnection();
        try {
            this.emit('Ejecutando apt-get update...');
            await runSSH(ssh, 'sudo apt-get update -qq', (line) => {
                if (line) this.emit(line);
            });

            this.emit('Ejecutando apt-get upgrade...', undefined, 85);
            await runSSH(ssh, 'sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq', (line) => {
                if (line) this.emit(line);
            });

            this.emit('Paquetes actualizados', undefined, 95);
        } finally {
            ssh.dispose();
        }
    }

    private vagrantUp(): Promise<void> {
        return this.vagrantCommand(['up', '--provider=virtualbox']);
    }

    private vagrantCommand(args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const stderrLines: string[] = [];

            const proc = spawn('vagrant', args, {
                cwd: process.cwd(),
                shell: true,
            });

            proc.stdout.on('data', (data: Buffer) => {
                const lines = data.toString().split('\n').filter(Boolean);
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    // Estimar progreso basado en output de Vagrant
                    if (trimmed.includes('Importing')) this.emit(trimmed, undefined, 20);
                    else if (trimmed.includes('Matching MAC')) this.emit(trimmed, undefined, 30);
                    else if (trimmed.includes('Booting')) this.emit(trimmed, undefined, 40);
                    else if (trimmed.includes('Waiting for machine')) this.emit(trimmed, undefined, 50);
                    else if (trimmed.includes('Machine booted')) this.emit(trimmed, undefined, 60);
                    else if (trimmed.includes('Mounting shared')) this.emit(trimmed, undefined, 65);
                    else if (trimmed.includes('Running provisioner')) this.emit(trimmed, undefined, 70);
                    else this.emit(trimmed);
                }
            });

            proc.stderr.on('data', (data: Buffer) => {
                const lines = data.toString().split('\n').filter(Boolean);
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    stderrLines.push(trimmed);
                    this.emit(`[stderr] ${trimmed}`);
                }
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    const detail = stderrLines.length > 0
                        ? stderrLines.slice(-5).join(' | ')
                        : 'Sin detalles de error';
                    reject(new Error(`vagrant ${args.join(' ')} exit code ${code}: ${detail}`));
                }
            });

            proc.on('error', (err) => {
                this.emit(`[error] No se pudo ejecutar vagrant: ${err.message}`);
                reject(err);
            });
        });
    }
}
