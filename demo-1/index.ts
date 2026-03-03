import express from 'express';
import cors from 'cors';
import { ToolLoopAgent, tool, stepCountIs, generateText } from 'ai';
import type { ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import * as path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import Redis from 'ioredis';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Conexión a Valkey (compatible con Redis)
const redis = new Redis.default({
    host: process.env.VALKEY_HOST || 'localhost',
    port: Number(process.env.VALKEY_PORT) || 6379,
});

redis.on('connect', () => console.log('✅ Conectado a Valkey'));
redis.on('error', (err: Error) => console.error('❌ Error de Valkey:', err.message));

app.use(cors());
app.use(express.json());

// Servir la interfaz gráfica
app.use(express.static(path.join(__dirname, 'public')));

// Crear el agente con ToolLoopAgent (reemplaza generateText + maxSteps en v6)
const pokemonAgent = new ToolLoopAgent({
    model: openai(MODEL),
    instructions: `Eres el Profesor Oak, el mayor experto en Pokémon del mundo.
El nombre del entrenador se proporciona al inicio de la conversación. Úsalo con frecuencia para hacer la charla personal.
Solo respondes sobre Pokémon. Si preguntan otra cosa, redirige amablemente al mundo Pokémon.

Cuando el entrenador mencione o pregunte por un Pokémon, SIEMPRE usa "obtener_datos_pokemon" y presenta una ficha completa con:
- Imagen (formato markdown: ![nombre](url))
- Tipos
- Estadísticas base (HP, Ataque, Defensa, etc.)
- Altura y peso convertidos a metros y kilogramos
Añade un dato curioso o consejo de combate breve al final.

Nunca inventes datos — todo debe venir de la herramienta.
No repitas información que ya hayas dado en la misma conversación.`,
    tools: {
        obtener_datos_pokemon: tool({
            description: 'Busca estadísticas principales, tipos, peso y altura de un Pokémon comprobándolo en la PokéAPI oficial.',
            inputSchema: z.object({
                nombre: z.string().describe('El nombre exacto del Pokémon en minúsculas y sin espacios. Ej: pikachu, charizard, gengar.'),
            }),
            execute: async ({ nombre }) => {
                const cacheKey = `pokemon:${nombre.toLowerCase()}`;
                console.log(`[Herramienta Ejecutada] -> Buscando datos de: ${nombre}`);

                try {
                    // Verificar cache en Valkey (TTL: 1 hora)
                    const cached = await redis.get(cacheKey);
                    if (cached) {
                        console.log(`  ⚡ Cache HIT para: ${nombre}`);
                        return JSON.parse(cached);
                    }

                    console.log(`  🌐 Cache MISS — consultando PokéAPI...`);
                    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${nombre.toLowerCase()}`);

                    if (!res.ok) {
                        return { error: `Pokémon '${nombre}' no fue encontrado. Dile al entrenador que no hay registros de este.` };
                    }

                    const data = await res.json();

                    const result = {
                        nombre: data.name,
                        id: data.id,
                        tipos: data.types.map((t: any) => t.type.name),
                        estadisticas_base: data.stats.map((s: any) => ({
                            estadistica: s.stat.name,
                            valor: s.base_stat
                        })),
                        altura_decimetros: data.height,
                        peso_hectogramos: data.weight,
                        imagen: data.sprites.front_default
                    };

                    // Guardar en cache con TTL de 24 horas (86400 segundos)
                    await redis.set(cacheKey, JSON.stringify(result), 'EX', 86400);
                    console.log(`  💾 Guardado en cache: ${nombre} (TTL: 24h)`);

                    return result;
                } catch (error) {
                    return { error: 'Error de conexión con la red regional de la Pokédex.' };
                }
            },
        }),
    },
    stopWhen: stepCountIs(3), // Equivalente al antiguo maxSteps: 3
});

// ── Helper: generar resumen de conversación con IA ──
async function generateConversationSummary(messages: { role: string; content: string }[]): Promise<string> {
    try {
        const conversation = messages
            .map(m => `${m.role}: ${m.content}`)
            .join('\n')
            .substring(0, 500); // Limitar para no gastar muchos tokens

        const result = await generateText({
            model: openai(MODEL),
            prompt: `Genera un título corto (máximo 50 caracteres) en español que describa de qué trata esta conversación sobre Pokémon. Solo responde con el título, sin comillas ni puntos al final.\n\nConversación:\n${conversation}`,
        });

        return result.text.trim() || 'Conversación Pokémon';
    } catch {
        // Fallback: usar el primer mensaje del usuario
        const firstUserMsg = messages.find(m => m.role === 'user');
        if (!firstUserMsg) return 'Nueva conversación';
        const text = firstUserMsg.content;
        return text.length > 50 ? text.substring(0, 50) + '…' : text;
    }
}

// ── POST /api/chat (streaming via SSE) ──
app.post('/api/chat', async (req, res) => {
    const { messages, conversationId } = req.body as {
        messages: ModelMessage[];
        conversationId?: string;
    };

    if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: 'Messages array is required.' });
        return;
    }

    // Generar o reusar ID de conversación
    const convId = conversationId || `conv:${Date.now()}:${Math.random().toString(36).substring(2, 8)}`;

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Enviar conversationId de inmediato
    res.write(`data: ${JSON.stringify({ type: 'id', conversationId: convId })}\n\n`);

    try {
        // Recortar historial: solo enviar los últimos 10 mensajes para reducir tokens de input
        const MAX_MESSAGES = 10;
        const trimmedMessages = messages.length > MAX_MESSAGES
            ? messages.slice(-MAX_MESSAGES)
            : messages;

        const result = await pokemonAgent.stream({
            messages: trimmedMessages,
        });

        let fullText = '';

        for await (const chunk of result.textStream) {
            fullText += chunk;
            res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);
        }

        // Señal de fin de stream
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();

        // Guardar conversación en Valkey (fire-and-forget para no bloquear)
        const allMessages = [
            ...messages.map(m => ({ role: (m as any).role, content: (m as any).content })),
            { role: 'assistant', content: fullText },
        ];

        // Guardar inmediatamente con preview temporal, luego actualizar con resumen IA
        const convData = {
            id: convId,
            messages: allMessages,
            preview: allMessages.find(m => m.role === 'user')?.content.substring(0, 50) || 'Conversación Pokémon',
            updatedAt: Date.now(),
        };
        await redis.set(`conversation:${convId}`, JSON.stringify(convData));
        await redis.zadd('conversations:index', Date.now(), convId);

        // Generar resumen con IA en background (no bloquea)
        generateConversationSummary(allMessages).then(async (summary) => {
            convData.preview = summary;
            await redis.set(`conversation:${convId}`, JSON.stringify(convData));
        }).catch(() => {});

    } catch (error: any) {
        console.error('Error al generar respuesta:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Error del servidor' })}\n\n`);
        res.end();
    }
});

// ── GET /api/conversations ── listar todas las conversaciones
app.get('/api/conversations', async (_req, res) => {
    try {
        // Obtener IDs ordenados por más reciente primero
        const convIds = await redis.zrevrange('conversations:index', 0, -1);

        if (convIds.length === 0) {
            res.json([]);
            return;
        }

        const conversations = [];
        for (const id of convIds) {
            const data = await redis.get(`conversation:${id}`);
            if (data) {
                const parsed = JSON.parse(data);
                conversations.push({
                    id: parsed.id,
                    preview: parsed.preview,
                    messageCount: parsed.messages.length,
                    updatedAt: parsed.updatedAt,
                });
            }
        }

        res.json(conversations);
    } catch (error: any) {
        console.error('Error al listar conversaciones:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── GET /api/conversations/:id ── obtener una conversación
app.get('/api/conversations/:id', async (req, res) => {
    try {
        const data = await redis.get(`conversation:${req.params.id}`);
        if (!data) {
            res.status(404).json({ error: 'Conversación no encontrada' });
            return;
        }
        res.json(JSON.parse(data));
    } catch (error: any) {
        console.error('Error al obtener conversación:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── DELETE /api/conversations/:id ── eliminar una conversación
app.delete('/api/conversations/:id', async (req, res) => {
    try {
        const convId = req.params.id;
        await redis.del(`conversation:${convId}`);
        await redis.zrem('conversations:index', convId);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error al eliminar conversación:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`🎮 ¡Abre esa URL en tu navegador para ver la interfaz Pokedex!\n`);
});
