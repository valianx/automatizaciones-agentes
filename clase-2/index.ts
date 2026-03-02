import express from 'express';
import cors from 'cors';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import 'dotenv/config';
import { eventBus } from './lib/event-bus.js';
import { Orchestrator } from './orchestrator.js';
import { isResourceAgentId } from './lib/types.js';
import type { AgentEvent, ResourceAgentId } from './lib/types.js';
import { updateAgentState, getAgentStates, clearAgentStates } from './lib/agent-state.js';
import type { Response } from 'express';
import { PostgreSQLAgent } from './agents/postgresql-agent.js';
import { RedisAgent } from './agents/redis-agent.js';
import { RabbitMQAgent } from './agents/rabbitmq-agent.js';
import { NodeJSAgent } from './agents/nodejs-agent.js';
import { PnpmAgent } from './agents/pnpm-agent.js';
import { SSHConfigAgent } from './agents/ssh-agent.js';
import { DockerAgent } from './agents/docker-agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Clientes SSE conectados
const sseClients: Set<Response> = new Set();

// SSE endpoint — el browser se conecta aquí para recibir eventos en tiempo real
app.get('/api/events', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    res.write('\n');

    sseClients.add(res);

    req.on('close', () => {
        sseClients.delete(res);
    });
});

// Broadcast de eventos del event bus a todos los clientes SSE + persistir estado
eventBus.on('agent-event', (event: AgentEvent) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
        client.write(data);
    }
    // Persistir estado por agente
    updateAgentState(event.agentId, event.status, event.message, event.progress);
});

let orchestrator: Orchestrator | null = null;
let destroying = false;

// POST /api/provision — arranca el provisioning completo
app.post('/api/provision', (_req, res) => {
    if (orchestrator?.isRunning()) {
        res.status(409).json({ error: 'Provisioning en progreso' });
        return;
    }
    if (destroying) {
        res.status(409).json({ error: 'Destroy en progreso, espera a que termine' });
        return;
    }

    clearAgentStates();
    orchestrator = new Orchestrator();
    res.json({ status: 'started', message: 'Provisioning iniciado' });

    orchestrator.run().catch((err: Error) => {
        console.error('Orchestrator error:', err.message);
    });
});

// GET /api/vm-status — chequea si la VM "clase2-infra-agent" existe y está corriendo
const VM_NAME = 'vm-infra-agent';

app.get('/api/vm-status', (_req, res) => {
    try {
        // Verificar directamente en VirtualBox por nombre exacto de la VM
        const output = execSync(`VBoxManage showvminfo "${VM_NAME}" --machinereadable`, {
            encoding: 'utf-8',
            timeout: 10000,
        });

        const stateMatch = output.match(/VMState="(\w+)"/);
        const vmState = stateMatch?.[1];

        if (vmState === 'running') {
            res.json({
                vm: 'running',
                name: VM_NAME,
                agentStates: getAgentStates(),
            });
        } else {
            res.json({ vm: vmState || 'not_found', name: VM_NAME, agentStates: {} });
        }
    } catch {
        // VM no existe en VirtualBox
        res.json({ vm: 'not_found', name: VM_NAME, agentStates: {} });
    }
});

// POST /api/retry/:agentId — reintenta un agente de recurso individual
const agentFactories: Record<ResourceAgentId, () => { run(): Promise<boolean> }> = {
    'postgresql': () => new PostgreSQLAgent(),
    'redis': () => new RedisAgent(),
    'rabbitmq': () => new RabbitMQAgent(),
    'nodejs': () => new NodeJSAgent(),
    'pnpm': () => new PnpmAgent(),
    'ssh-config': () => new SSHConfigAgent(),
    'docker': () => new DockerAgent(),
};

const retryingAgents = new Set<string>();

app.post('/api/retry/:agentId', (req, res) => {
    const { agentId } = req.params;

    if (!isResourceAgentId(agentId)) {
        res.status(400).json({ error: `Invalid agent ID: ${agentId}` });
        return;
    }

    if (destroying) {
        res.status(409).json({ error: 'Destroy en progreso' });
        return;
    }

    if (retryingAgents.has(agentId)) {
        res.status(409).json({ error: `Agent ${agentId} is already retrying` });
        return;
    }

    retryingAgents.add(agentId);
    res.json({ status: 'started', agentId, message: `Retrying ${agentId}...` });

    const agent = agentFactories[agentId]();
    agent.run()
        .then((verified: boolean) => {
            if (verified) {
                eventBus.emitEvent({ agentId, type: 'status', status: 'success', message: `${agentId} completado`, progress: 100, timestamp: Date.now() });
            } else {
                eventBus.emitEvent({ agentId, type: 'status', status: 'error', message: `${agentId}: verificacion no exitosa`, timestamp: Date.now() });
            }
        })
        .catch((err: Error) => {
            console.error(`Retry error for ${agentId}:`, err.message);
            eventBus.emitEvent({ agentId, type: 'status', status: 'error', message: `${agentId}: error - ${err.message}`, timestamp: Date.now() });
        })
        .finally(() => {
            retryingAgents.delete(agentId);
        });
});

// POST /api/destroy — destruye la VM
app.post('/api/destroy', (_req, res) => {
    if (orchestrator?.isRunning()) {
        res.status(409).json({ error: 'No se puede destruir mientras el provisioning esta en progreso' });
        return;
    }
    if (destroying) {
        res.status(409).json({ error: 'Destroy ya en progreso' });
        return;
    }

    destroying = true;
    clearAgentStates();
    res.json({ status: 'started', message: 'Destroying VM...' });

    const destroyOrch = new Orchestrator();
    destroyOrch.destroy()
        .catch((err: Error) => {
            console.error('Destroy error:', err.message);
        })
        .finally(() => {
            destroying = false;
        });
});

const server = app.listen(PORT, () => {
    console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📊 Dashboard de agentes disponible en esa URL\n`);
});

// Mantener el proceso vivo
server.on('error', (err: Error) => {
    console.error('Server error:', err.message);
    process.exit(1);
});
