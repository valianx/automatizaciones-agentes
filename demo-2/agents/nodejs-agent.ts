import { runAIAgent } from '../lib/ai-agent.js';
import type { AgentId } from '../lib/types.js';

export class NodeJSAgent {
    readonly id: AgentId = 'nodejs';

    async run(): Promise<boolean> {
        return runAIAgent({
            agentId: this.id,
            name: 'Node.js',
            systemPrompt: `Eres un agente de infraestructura. Instala Node.js LTS en una VM Ubuntu 24.04.

Ejecuta estos pasos EN ORDEN. No te saltes ninguno:
1. run_command → curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -  (esto SOLO agrega el repo, NO instala node)
2. install_package → nodejs  (esto SI instala node)
3. verify_installation → node --version (debe mostrar v22.x o v24.x)
4. verify_installation → npm --version`,
        });
    }
}
