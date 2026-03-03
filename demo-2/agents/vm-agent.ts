import { spawn, execSync } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { eventBus } from '../lib/event-bus.js';
import { createSSHConnection, runSSH } from '../lib/ssh-client.js';
import type { AgentId, AgentStatus } from '../lib/types.js';

const VM_NAME = 'vm-infra-agent';

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

        // Limpiar residuos de VMs anteriores que puedan causar conflictos
        this.cleanupVBox();
        const vboxDir = join(homedir(), 'VirtualBox VMs', VM_NAME);
        try {
            rmSync(vboxDir, { recursive: true, force: true });
        } catch {
            // No existe, OK
        }
        // Limpiar estado interno de Vagrant para evitar que intente reusar una VM eliminada
        const vagrantMachinesDir = join(process.cwd(), '.vagrant', 'machines');
        try {
            rmSync(vagrantMachinesDir, { recursive: true, force: true });
        } catch {
            // No existe, OK
        }

        await this.vagrantUp();

        // Actualizar paquetes del sistema después de levantar la VM
        this.emit('VM lista. Actualizando paquetes del sistema...', undefined, 75);
        await this.updatePackages();

        this.emit('VM lista y paquetes actualizados. SSH accesible.', 'success', 100);
    }

    async destroy(): Promise<void> {
        this.emit('Destruyendo VM...', 'running', 0);

        // 1. Intentar vagrant destroy (puede fallar si el estado es inconsistente)
        try {
            await this.vagrantCommand(['destroy', '-f']);
            this.emit('vagrant destroy completado', undefined, 40);
        } catch (err: any) {
            this.emit(`vagrant destroy fallo (${err.message}), limpiando manualmente...`);
        }

        // 2. Limpiar VMs huerfanas en VirtualBox directamente
        this.cleanupVBox();

        // 3. Eliminar directorio residual de VirtualBox VMs
        const vboxDir = join(homedir(), 'VirtualBox VMs', VM_NAME);
        try {
            rmSync(vboxDir, { recursive: true, force: true });
            this.emit('Directorio VirtualBox limpiado', undefined, 70);
        } catch {
            // No existe o ya fue borrado, OK
        }

        // 4. Limpiar estado interno de Vagrant (.vagrant/machines)
        const vagrantMachinesDir = join(process.cwd(), '.vagrant', 'machines');
        try {
            rmSync(vagrantMachinesDir, { recursive: true, force: true });
            this.emit('Estado Vagrant limpiado', undefined, 90);
        } catch {
            // No existe, OK
        }

        this.emit('VM destruida', 'success', 100);
    }

    /**
     * Busca y desregistra cualquier VM en VirtualBox que coincida con VM_NAME
     * o que sea una VM temporal de Vagrant para este proyecto.
     */
    private cleanupVBox(): void {
        try {
            const output = execSync('VBoxManage list vms', { encoding: 'utf-8', timeout: 10000 });
            const vmRegex = /"([^"]+)"\s+\{([^}]+)\}/g;
            let match;

            while ((match = vmRegex.exec(output)) !== null) {
                const name = match[1]!;
                const uuid = match[2]!;
                // Limpiar la VM si coincide con el nombre esperado o con el patron temporal de Vagrant
                if (name === VM_NAME || name.startsWith('ubuntu-24.04-amd64_')) {
                    this.emit(`Desregistrando VM huerfana: ${name}`);
                    // Apagar la VM primero si esta corriendo
                    try {
                        execSync(`VBoxManage controlvm "${uuid}" poweroff`, { timeout: 15000 });
                    } catch {
                        // No estaba corriendo, OK
                    }
                    try {
                        execSync(`VBoxManage unregistervm "${uuid}" --delete`, { timeout: 30000 });
                    } catch {
                        // Intentar solo desregistrar sin borrar disco
                        try {
                            execSync(`VBoxManage unregistervm "${uuid}"`, { timeout: 10000 });
                        } catch {
                            this.emit(`No se pudo desregistrar ${name}, ignorando`);
                        }
                    }
                }
            }
        } catch {
            // VBoxManage no disponible o sin VMs, OK
        }
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
