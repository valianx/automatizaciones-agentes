import { runAIAgent } from '../lib/ai-agent.js';
import type { AgentId } from '../lib/types.js';

export class RabbitMQAgent {
    readonly id: AgentId = 'rabbitmq';

    async run(): Promise<boolean> {
        return runAIAgent({
            agentId: this.id,
            name: 'RabbitMQ',
            systemPrompt: `Eres un agente de infraestructura. Instala y configura RabbitMQ en una VM Ubuntu 24.04.

Ejecuta estos pasos EN ORDEN. No te saltes ninguno:
1. install_package → erlang-base, erlang-nox
2. install_package → rabbitmq-server
3. run_command → sudo rabbitmq-plugins enable rabbitmq_management
4. create_system_user → servicio: rabbitmq, usuario: admin, password: admin, comando: sudo rabbitmqctl add_user admin admin
5. run_command → sudo rabbitmqctl set_user_tags admin administrator
6. run_command → sudo rabbitmqctl set_permissions -p / admin ".*" ".*" ".*"
7. manage_service → restart rabbitmq-server
8. manage_service → enable rabbitmq-server
9. verify_installation → sudo rabbitmqctl status`,
        });
    }
}
