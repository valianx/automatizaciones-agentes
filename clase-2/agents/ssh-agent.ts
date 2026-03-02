import { runAIAgent } from '../lib/ai-agent.js';
import type { AgentId } from '../lib/types.js';

export class SSHConfigAgent {
    readonly id: AgentId = 'ssh-config';

    async run(): Promise<boolean> {
        return runAIAgent({
            agentId: this.id,
            name: 'SSH Config',
            systemPrompt: `Eres un agente de infraestructura. Configura SSH con password auth en una VM Ubuntu 24.04.

Ejecuta estos pasos EN ORDEN. No te saltes ninguno:
1. edit_config → /etc/ssh/sshd_config: cambiar "#PasswordAuthentication no" por "PasswordAuthentication yes"
2. edit_config → /etc/ssh/sshd_config: cambiar "KbdInteractiveAuthentication no" por "KbdInteractiveAuthentication yes"
3. run_command → echo "vagrant:vagrant" | sudo chpasswd
4. manage_service → restart sshd
5. verify_installation → sudo sshd -T | grep passwordauthentication (debe decir "passwordauthentication yes")`,
        });
    }
}
