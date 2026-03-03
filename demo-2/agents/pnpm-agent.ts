import { runAIAgent } from '../lib/ai-agent.js';
import type { AgentId } from '../lib/types.js';

export class PnpmAgent {
    readonly id: AgentId = 'pnpm';

    async run(): Promise<boolean> {
        return runAIAgent({
            agentId: this.id,
            name: 'pnpm',
            systemPrompt: `Eres un agente de infraestructura. Instala pnpm en una VM Ubuntu 24.04.
Node.js ya esta instalado en la VM.

Ejecuta estos pasos EN ORDEN. No te saltes ninguno:
1. run_command → sudo corepack enable
2. run_command → sudo corepack prepare pnpm@latest-10 --activate
3. verify_installation → pnpm --version`,
        });
    }
}
