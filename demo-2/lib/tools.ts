import { tool, jsonSchema } from 'ai';
import type { NodeSSH } from 'node-ssh';
import { runSSH } from './ssh-client.js';

export interface ToolTracker {
    toolsCalled: string[];
    verificationPassed: boolean;
}

interface ToolDeps {
    ssh: NodeSSH;
    emit: (message: string) => void;
    successfulCommands: string[];
    tracker: ToolTracker;
}

async function execAndTrack(deps: ToolDeps, command: string, description: string) {
    const { ssh, emit, successfulCommands } = deps;
    emit(`▶ ${description}`);
    const { stdout, stderr, code } = await runSSH(ssh, command);
    const output = (stdout || stderr || '(sin output)').trim();
    if (output.length > 0) {
        emit(`  ${output.slice(0, 300)}`);
    }
    if (code === 0) {
        successfulCommands.push(command);
    }
    return {
        exitCode: code,
        stdout: stdout.slice(0, 1000),
        stderr: stderr.slice(0, 500),
    };
}

/** Retries an apt command when dpkg lock is held by another process */
async function execWithAptRetry(deps: ToolDeps, command: string, description: string) {
    for (let retry = 0; retry < 5; retry++) {
        const label = retry > 0 ? `${description} (reintento ${retry + 1}/5)` : description;
        const result = await execAndTrack(deps, command, label);
        if (result.exitCode === 0 || !result.stderr.includes('Could not get lock')) {
            return result;
        }
        const wait = 10 + retry * 5;
        deps.emit(`  apt bloqueado por otro proceso, esperando ${wait}s...`);
        await new Promise(r => setTimeout(r, wait * 1000));
    }
    return execAndTrack(deps, command, `${description} (ultimo intento)`);
}

export function createInfraTools(deps: ToolDeps) {
    const { tracker } = deps;

    return {
        install_package: tool({
            description: 'Instala paquetes del sistema con apt-get. Maneja sudo y DEBIAN_FRONTEND automaticamente.',
            inputSchema: jsonSchema<{ packages: string[]; options?: string }>({
                type: 'object',
                properties: {
                    packages: { type: 'array', items: { type: 'string' }, description: 'Lista de paquetes a instalar' },
                    options: { type: 'string', description: 'Opciones adicionales para apt-get (ej: --no-install-recommends)' },
                },
                required: ['packages'],
            }),
            execute: async ({ packages, options }) => {
                tracker.toolsCalled.push(`install_package(${packages.join(', ')})`);
                const opts = options ? ` ${options}` : '';
                const cmd = `sudo DEBIAN_FRONTEND=noninteractive apt-get install -y${opts} ${packages.join(' ')}`;
                return execWithAptRetry(deps, cmd, `Instalando: ${packages.join(', ')}`);
            },
        }),

        add_apt_repository: tool({
            description: 'Agrega un repositorio APT externo. Descarga clave GPG, agrega sources list y ejecuta apt update.',
            inputSchema: jsonSchema<{ name: string; gpg_url?: string; repo_line: string }>({
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Nombre del repositorio (para el archivo .list y keyring)' },
                    gpg_url: { type: 'string', description: 'URL de la clave GPG' },
                    repo_line: { type: 'string', description: 'Linea del repositorio' },
                },
                required: ['name', 'repo_line'],
            }),
            execute: async ({ name, gpg_url, repo_line }) => {
                tracker.toolsCalled.push(`add_apt_repository(${name})`);
                const cmds: string[] = [];
                if (gpg_url) {
                    cmds.push(`sudo install -m 0755 -d /etc/apt/keyrings`);
                    cmds.push(`curl -fsSL ${gpg_url} | sudo tee /etc/apt/keyrings/${name}.asc > /dev/null`);
                    cmds.push(`sudo chmod a+r /etc/apt/keyrings/${name}.asc`);
                }
                cmds.push(`echo '${repo_line}' | sudo tee /etc/apt/sources.list.d/${name}.list > /dev/null`);
                cmds.push('sudo apt-get update -qq');
                return execWithAptRetry(deps, cmds.join(' && '), `Agregando repositorio: ${name}`);
            },
        }),

        edit_config: tool({
            description: 'Edita un archivo de configuracion buscando un patron y reemplazandolo. Usa sed internamente.',
            inputSchema: jsonSchema<{ file_path: string; search: string; replace: string }>({
                type: 'object',
                properties: {
                    file_path: { type: 'string', description: 'Ruta completa del archivo' },
                    search: { type: 'string', description: 'Patron a buscar (regex sed)' },
                    replace: { type: 'string', description: 'Texto de reemplazo' },
                },
                required: ['file_path', 'search', 'replace'],
            }),
            execute: async ({ file_path, search, replace }) => {
                tracker.toolsCalled.push(`edit_config(${file_path})`);
                const cmd = `sudo sed -i 's|${search}|${replace}|g' ${file_path}`;
                return execAndTrack(deps, cmd, `Editando ${file_path}: ${search} → ${replace}`);
            },
        }),

        append_config: tool({
            description: 'Agrega una linea al final de un archivo de configuracion, solo si no existe ya (idempotente).',
            inputSchema: jsonSchema<{ file_path: string; line: string }>({
                type: 'object',
                properties: {
                    file_path: { type: 'string', description: 'Ruta completa del archivo' },
                    line: { type: 'string', description: 'Linea a agregar' },
                },
                required: ['file_path', 'line'],
            }),
            execute: async ({ file_path, line }) => {
                tracker.toolsCalled.push(`append_config(${file_path})`);
                const cmd = `sudo grep -qxF '${line}' ${file_path} 2>/dev/null || echo '${line}' | sudo tee -a ${file_path} > /dev/null`;
                return execAndTrack(deps, cmd, `Agregando linea a ${file_path}`);
            },
        }),

        manage_service: tool({
            description: 'Administra un servicio del sistema con systemctl (start, stop, restart, enable, status).',
            inputSchema: jsonSchema<{ name: string; action: 'start' | 'stop' | 'restart' | 'enable' | 'status' }>({
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Nombre del servicio (ej: postgresql, redis-server, docker)' },
                    action: { type: 'string', enum: ['start', 'stop', 'restart', 'enable', 'status'], description: 'Accion a realizar' },
                },
                required: ['name', 'action'],
            }),
            execute: async ({ name, action }) => {
                tracker.toolsCalled.push(`manage_service(${name}, ${action})`);
                const cmd = `sudo systemctl ${action} ${name}`;
                return execAndTrack(deps, cmd, `Servicio ${name}: ${action}`);
            },
        }),

        create_system_user: tool({
            description: 'Crea o configura un usuario en un servicio. Proporciona el comando especifico del servicio (psql, rabbitmqctl, etc.).',
            inputSchema: jsonSchema<{ service: string; username: string; password: string; command: string }>({
                type: 'object',
                properties: {
                    service: { type: 'string', description: 'Nombre del servicio (postgresql, rabbitmq, etc.)' },
                    username: { type: 'string', description: 'Nombre del usuario' },
                    password: { type: 'string', description: 'Password del usuario' },
                    command: { type: 'string', description: 'Comando completo para crear/modificar el usuario' },
                },
                required: ['service', 'username', 'password', 'command'],
            }),
            execute: async ({ service, username, command }) => {
                tracker.toolsCalled.push(`create_system_user(${service}, ${username})`);
                return execAndTrack(deps, command, `Configurando usuario '${username}' en ${service}`);
            },
        }),

        verify_installation: tool({
            description: 'Ejecuta un comando de verificacion para confirmar que la instalacion fue exitosa.',
            inputSchema: jsonSchema<{ command: string; expected_output?: string }>({
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Comando de verificacion (ej: node --version, redis-cli ping)' },
                    expected_output: { type: 'string', description: 'Texto esperado en la salida' },
                },
                required: ['command'],
            }),
            execute: async ({ command, expected_output }) => {
                tracker.toolsCalled.push(`verify_installation(${command})`);
                const result = await execAndTrack(deps, command, `Verificando: ${command}`);
                let verified = result.exitCode === 0;
                if (expected_output && verified) {
                    verified = result.stdout.includes(expected_output);
                }
                if (verified) {
                    tracker.verificationPassed = true;
                }
                return { ...result, verified, expected: expected_output };
            },
        }),

        run_command: tool({
            description: 'FALLBACK: Ejecuta un comando shell arbitrario. Usa esto SOLO cuando las otras herramientas no cubran tu necesidad.',
            inputSchema: jsonSchema<{ command: string; description: string }>({
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Comando shell a ejecutar' },
                    description: { type: 'string', description: 'Descripcion breve de lo que hace' },
                },
                required: ['command', 'description'],
            }),
            execute: async ({ command, description }) => {
                tracker.toolsCalled.push(`run_command(${description})`);
                return execAndTrack(deps, command, description);
            },
        }),
    };
}
