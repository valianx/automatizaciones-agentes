import { NodeSSH } from 'node-ssh';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function createSSHConnection(maxRetries = 5, baseDelay = 2000): Promise<NodeSSH> {
    const ssh = new NodeSSH();
    const config = {
        host: process.env.SSH_HOST || '127.0.0.1',
        port: Number(process.env.SSH_PORT || 2222),
        username: process.env.SSH_USER || 'vagrant',
        privateKeyPath: process.env.VAGRANT_PRIVATE_KEY ||
            '.vagrant/machines/default/virtualbox/private_key',
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await ssh.connect(config);
            return ssh;
        } catch (err) {
            if (attempt === maxRetries) throw err;
            const delay = baseDelay * Math.pow(2, attempt - 1);
            await sleep(delay);
        }
    }

    throw new Error('SSH connection failed after all retries');
}

export async function runSSH(
    ssh: NodeSSH,
    command: string,
    onOutput?: (line: string) => void,
): Promise<{ stdout: string; stderr: string; code: number }> {
    const result = await ssh.execCommand(command, {
        onStdout: onOutput ? (chunk) => onOutput(chunk.toString().trim()) : undefined,
        onStderr: onOutput ? (chunk) => onOutput(`[stderr] ${chunk.toString().trim()}`) : undefined,
    });

    return {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code ?? 0,
    };
}
