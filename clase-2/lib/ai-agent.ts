import { generateText, tool, jsonSchema, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createSSHConnection } from './ssh-client.js';
import { createInfraTools, type ToolTracker } from './tools.js';
import { eventBus } from './event-bus.js';
import { formatReportsForPrompt, saveReport } from './reports.js';
import type { AgentId, AgentStatus } from './types.js';

/**
 * Runs a SINGLE attempt of an AI agent. Returns true if verify_installation passed.
 * Does NOT emit final success/error status — the caller (orchestrator) decides that.
 * Throws only on fatal errors (SSH, API).
 */
export async function runAIAgent(options: {
    agentId: AgentId;
    name: string;
    systemPrompt: string;
    steps?: number;
    attempt?: number;
    previousTools?: string[];
}): Promise<boolean> {
    const { agentId, name, systemPrompt, steps = 30, attempt = 1, previousTools = [] } = options;
    const successfulCommands: string[] = [];

    const emit = (message: string, status?: AgentStatus, progress?: number) => {
        eventBus.emitEvent({
            agentId,
            type: status ? 'status' : 'log',
            status,
            message,
            progress,
            timestamp: Date.now(),
        });
    };

    if (attempt === 1) {
        emit(`Conectando agente AI para ${name}...`, 'running', 0);
    } else {
        emit(`Reintento ${attempt} para ${name}...`);
    }

    // Leer reportes previos para aprender de errores pasados
    const previousReports = formatReportsForPrompt(agentId);
    if (previousReports && attempt === 1) {
        emit('Cargando reportes de ejecuciones anteriores...');
    }

    const fullSystemPrompt = `${systemPrompt}

REGLAS CRITICAS:
1. Debes ejecutar TODOS los pasos listados arriba, uno por uno. No te saltes ningun paso.
2. SIEMPRE usa verify_installation como ULTIMO paso para confirmar que el servicio funciona.
3. Si un comando falla, analiza el error e intenta resolverlo. No te rindas facilmente.
4. Si un paso ya se ejecuto exitosamente en un intento anterior, puedes saltarlo.
${previousReports}`;

    const modelId = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const tracker: ToolTracker = {
        toolsCalled: [],
        verificationPassed: false,
    };

    const ssh = await createSSHConnection();

    try {
        const infraTools = createInfraTools({
            ssh,
            emit: (msg) => emit(msg),
            successfulCommands,
            tracker,
        });

        const allTools = {
            ...infraTools,
            report_progress: tool({
                description: 'Reporta el progreso al dashboard.',
                inputSchema: jsonSchema<{ message: string; percent: number }>({
                    type: 'object',
                    properties: {
                        message: { type: 'string', description: 'Mensaje de progreso' },
                        percent: { type: 'number', minimum: 0, maximum: 100, description: 'Porcentaje (0-100)' },
                    },
                    required: ['message', 'percent'],
                }),
                execute: async ({ message, percent }) => {
                    const clampedPercent = Math.min(percent, 95);
                    emit(message, undefined, clampedPercent);
                    return { ok: true };
                },
            }),
            save_report: tool({
                description: 'Guarda un reporte de error y resolucion para futuras ejecuciones.',
                inputSchema: jsonSchema<{ error: string; resolution: string }>({
                    type: 'object',
                    properties: {
                        error: { type: 'string', description: 'Descripcion del error' },
                        resolution: { type: 'string', description: 'Como se resolvio, o "sin resolver"' },
                    },
                    required: ['error', 'resolution'],
                }),
                execute: async ({ error, resolution }) => {
                    saveReport({
                        agentId,
                        timestamp: new Date().toISOString(),
                        error,
                        resolution,
                        commands: successfulCommands.slice(-10),
                    });
                    emit(`Reporte guardado: ${error.slice(0, 100)}`);
                    return { saved: true };
                },
            }),
        };

        const prompt = attempt === 1
            ? 'Procede con la instalacion y configuracion. Ejecuta TODOS los pasos en orden y termina con verify_installation.'
            : `INTENTO ${attempt}/3. En el intento anterior se ejecutaron: [${previousTools.join(', ')}] pero la verificacion no fue exitosa. Ejecuta los pasos que falten y termina con verify_installation.`;

        await generateText({
            model: openai(modelId),
            system: fullSystemPrompt,
            prompt,
            stopWhen: stepCountIs(steps),
            tools: allTools,
        });

        return tracker.verificationPassed;
    } catch (err: any) {
        saveReport({
            agentId,
            timestamp: new Date().toISOString(),
            error: err.message,
            resolution: 'Error fatal - agente no pudo completar la tarea',
            commands: successfulCommands,
        });
        emit(`Error: ${err.message}`);
        throw err;
    } finally {
        ssh.dispose();
    }
}
