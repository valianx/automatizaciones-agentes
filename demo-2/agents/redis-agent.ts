import { runAIAgent } from '../lib/ai-agent.js';
import type { AgentId } from '../lib/types.js';

export class RedisAgent {
    readonly id: AgentId = 'redis';

    async run(): Promise<boolean> {
        return runAIAgent({
            agentId: this.id,
            name: 'Redis',
            systemPrompt: `Eres un agente de infraestructura. Instala y configura Redis en una VM Ubuntu 24.04.

Ejecuta estos pasos EN ORDEN. No te saltes ninguno:
1. install_package → redis-server
2. edit_config → /etc/redis/redis.conf: cambiar "bind 127.0.0.1" por "bind 0.0.0.0"
3. edit_config → /etc/redis/redis.conf: cambiar "protected-mode yes" por "protected-mode no"
4. manage_service → restart redis-server
5. manage_service → enable redis-server
6. verify_installation → redis-cli ping (debe responder PONG)`,
        });
    }
}
