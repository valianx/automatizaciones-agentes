import { runAIAgent } from '../lib/ai-agent.js';
import type { AgentId } from '../lib/types.js';

export class PostgreSQLAgent {
    readonly id: AgentId = 'postgresql';

    async run(): Promise<boolean> {
        return runAIAgent({
            agentId: this.id,
            name: 'PostgreSQL',
            systemPrompt: `Eres un agente de infraestructura. Instala y configura PostgreSQL en una VM Ubuntu 24.04.

Ejecuta estos pasos EN ORDEN. No te saltes ninguno:
1. install_package → postgresql, postgresql-contrib
2. run_command → ls /etc/postgresql/ (para detectar la version, ej: 16)
3. edit_config → en /etc/postgresql/<VERSION>/main/postgresql.conf cambiar "#listen_addresses = 'localhost'" por "listen_addresses = '*'"
4. append_config → en /etc/postgresql/<VERSION>/main/pg_hba.conf agregar: host all all 0.0.0.0/0 md5
5. create_system_user → servicio: postgresql, usuario: postgres, password: postgres, comando: sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
6. manage_service → restart postgresql
7. manage_service → enable postgresql
8. verify_installation → sudo -u postgres psql -c "SELECT version();"`,
        });
    }
}
