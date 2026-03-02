import express from 'express';
import cors from 'cors';
import * as path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { eventBus } from './lib/event-bus.js';
import { Orchestrator } from './orchestrator.js';
import type { AgentEvent } from './lib/types.js';
import type { Response } from 'express';

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

// Broadcast de eventos del event bus a todos los clientes SSE
eventBus.on('agent-event', (event: AgentEvent) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
        client.write(data);
    }
});

let orchestrator: Orchestrator | null = null;

// POST /api/provision — arranca el provisioning completo
app.post('/api/provision', (_req, res) => {
    if (orchestrator?.isRunning()) {
        res.status(409).json({ error: 'Provisioning already in progress' });
        return;
    }

    orchestrator = new Orchestrator();
    res.json({ status: 'started', message: 'Provisioning iniciado' });

    // Ejecutar en background (no bloqueamos la respuesta HTTP)
    orchestrator.run().catch((err: Error) => {
        console.error('Orchestrator error:', err.message);
    });
});

// POST /api/destroy — destruye la VM
app.post('/api/destroy', (_req, res) => {
    if (orchestrator?.isRunning()) {
        res.status(409).json({ error: 'Cannot destroy while provisioning is running' });
        return;
    }

    res.json({ status: 'started', message: 'Destroying VM...' });

    const destroyOrch = new Orchestrator();
    destroyOrch.destroy().catch((err: Error) => {
        console.error('Destroy error:', err.message);
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📊 Dashboard de agentes disponible en esa URL\n`);
});
