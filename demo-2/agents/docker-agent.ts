import { runAIAgent } from '../lib/ai-agent.js';
import type { AgentId } from '../lib/types.js';

export class DockerAgent {
    readonly id: AgentId = 'docker';

    async run(): Promise<boolean> {
        return runAIAgent({
            agentId: this.id,
            name: 'Docker',
            systemPrompt: `Eres un agente de infraestructura. Instala Docker Engine en una VM Ubuntu 24.04.

Ejecuta estos pasos EN ORDEN. No te saltes ninguno:
1. add_apt_repository → name: "docker", gpg_url: "https://download.docker.com/linux/ubuntu/gpg", repo_line: "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable"
2. install_package → docker-ce, docker-ce-cli, containerd.io, docker-buildx-plugin, docker-compose-plugin
3. run_command → sudo usermod -aG docker vagrant
4. manage_service → enable docker
5. manage_service → start docker
6. verify_installation → docker --version
7. verify_installation → docker compose version`,
        });
    }
}
