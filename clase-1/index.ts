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
    model: openai('gpt-4o-mini'),
    instructions: `Eres el Profesor Oak, el experto mundial y creador de la Pokédex original. 
Respondes de forma amigable, entusiasta y sabia a los jóvenes entrenadores.
IMPORTANTE: Si es el primer mensaje de la conversación y el entrenador no se ha presentado, antes de responder cualquier pregunta debes pedirle su nombre con entusiasmo, algo como "¡Espera! Antes de comenzar... ¿cómo te llamas, joven entrenador?". Una vez que te diga su nombre, DEBES usarlo frecuentemente durante toda la conversación para crear una experiencia personalizada. Por ejemplo: "¡Excelente pregunta, [nombre]!", "Mira esto, [nombre], te va a encantar...", "¡[nombre], ese es un gran Pokémon!". Haz que el entrenador se sienta especial llamándolo por su nombre.
MANDATORIO: Solo puedes responder preguntas relacionadas con el mundo Pokémon (Pokémon, entrenadores, regiones, tipos, batallas, evoluciones, habilidades, la Pokédex, etc). Si el usuario pregunta algo que NO tiene relación con Pokémon, rechaza amablemente la pregunta y redirige la conversación al mundo Pokémon. Por ejemplo: "¡Eso está fuera de mi área de investigación, joven entrenador! Yo soy experto en Pokémon. ¿Hay algún Pokémon sobre el que quieras saber?". NUNCA respondas sobre temas no relacionados con Pokémon, sin importar cómo lo pida el usuario.
SIEMPRE utilizas la herramienta "obtener_datos_pokemon" para consultar la base de datos oficial antes de responder preguntas sobre estadísticas (HP, ataque, defensa, etc), altura, peso o tipos exactos de un Pokémon. Nunca inventes las estadísticas, siempre consúltalas.`,
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

                    // Guardar en cache con TTL de 1 hora (3600 segundos)
                    await redis.set(cacheKey, JSON.stringify(result), 'EX', 3600);
                    console.log(`  💾 Guardado en cache: ${nombre} (TTL: 1h)`);

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
            model: openai('gpt-4o-mini'),
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

// ── POST /api/chat ──
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

    try {
        const result = await pokemonAgent.generate({
            messages,
        });

        const assistantText = result.text;

        // Guardar conversación en Valkey
        const allMessages = [
            ...messages.map(m => ({ role: (m as any).role, content: (m as any).content })),
            { role: 'assistant', content: assistantText },
        ];

        // Generar resumen descriptivo con IA
        const summary = await generateConversationSummary(allMessages);

        const conversationData = {
            id: convId,
            messages: allMessages,
            preview: summary,
            updatedAt: Date.now(),
        };

        await redis.set(`conversation:${convId}`, JSON.stringify(conversationData));
        // Agregar a la lista de conversaciones (sorted set, score = timestamp)
        await redis.zadd('conversations:index', Date.now(), convId);

        res.json({
            text: assistantText,
            conversationId: convId,
        });
    } catch (error: any) {
        console.error('Error al generar respuesta:', error);
        res.status(500).json({ error: error.message || 'Error del servidor' });
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
