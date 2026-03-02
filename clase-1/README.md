# Clase 1 — Pokedex AI Agent

Chatbot con un unico agente AI que actua como el Profesor Oak, especializado en datos Pokemon con persistencia de conversaciones.

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    Browser                           │
│  ┌───────────────────────────────────────────────┐  │
│  │           Pokedex UI (index.html)             │  │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────────┐  │  │
│  │  │  Chat   │  │ Sidebar  │  │ Sugerencias │  │  │
│  │  │  Area   │  │ History  │  │  Aleatorias │  │  │
│  │  └────┬────┘  └────┬─────┘  └─────────────┘  │  │
│  └───────┼─────────────┼─────────────────────────┘  │
└──────────┼─────────────┼────────────────────────────┘
           │ POST        │ GET
           │ /api/chat   │ /api/conversations
           ▼             ▼
┌──────────────────────────────────────┐
│         Express Server (index.ts)    │
│                                      │
│  ┌────────────────────────────────┐  │
│  │     pokemonAgent               │  │
│  │     (ToolLoopAgent)            │  │
│  │     modelo: gpt-4o-mini        │  │
│  │                                │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │ Tool: obtener_datos_pokemon│ │  │
│  │  │                          │  │  │
│  │  │  Cache hit? ──► Valkey   │  │  │
│  │  │       │                  │  │  │
│  │  │  Cache miss? ──► PokeAPI │  │  │
│  │  └──────────────────────────┘  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │          Valkey (Redis)        │  │
│  │  - Conversaciones              │  │
│  │  - Cache Pokemon (TTL 1h)      │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

## Agente

### pokemonAgent (ToolLoopAgent)

| Propiedad | Valor |
|-----------|-------|
| Tipo | `ToolLoopAgent` (AI SDK v6) |
| Modelo | `gpt-4o-mini` |
| Max steps | 3 |
| Rol | Profesor Oak — experto Pokemon |

**Comportamiento:**
- Pide el nombre del entrenador en la primera interaccion
- Solo responde preguntas sobre Pokemon
- Siempre consulta la API oficial para datos/estadisticas
- Personaliza las respuestas con el nombre del entrenador

### Tool: `obtener_datos_pokemon`

```
Input:  { nombre: string }    // nombre del pokemon en minusculas
Output: {
  nombre, id, tipos[],
  estadisticas: { hp, ataque, defensa, velocidad, ... },
  altura, peso,
  sprite_url
}
```

**Flujo:**
```
pokemonAgent llama obtener_datos_pokemon("pikachu")
        │
        ▼
  Valkey cache lookup ("pokemon:pikachu")
        │
   ┌────┴────┐
   │ HIT     │ MISS
   ▼         ▼
 Return    Fetch PokeAPI
 cached    (/api/v2/pokemon/pikachu)
 data          │
               ▼
          Cache en Valkey (TTL 1h)
               │
               ▼
          Return datos
```

## API Endpoints

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/chat` | POST | Enviar mensaje, recibir respuesta del agente |
| `/api/conversations` | GET | Listar todas las conversaciones |
| `/api/conversations/:id` | GET | Obtener historial de una conversacion |
| `/api/conversations/:id` | DELETE | Eliminar conversacion |

## Setup

```bash
# Requisitos: Node.js 22+, Valkey/Redis corriendo en localhost:6379

cd clase-1
cp .env.example .env
# Editar .env con tu OPENAI_API_KEY

pnpm install
pnpm start
```

Abrir http://localhost:3000.

## Variables de entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `OPENAI_API_KEY` | -- | API key de OpenAI (requerido) |
| `PORT` | `3000` | Puerto del servidor |
| `VALKEY_HOST` | `localhost` | Host de Valkey/Redis |
| `VALKEY_PORT` | `6379` | Puerto de Valkey/Redis |

## Stack

- TypeScript + tsx
- Express 5 + Vanilla HTML/CSS/JS
- AI SDK v6 (`ToolLoopAgent`) + OpenAI gpt-4o-mini
- Valkey (Redis) — persistencia + cache
- PokeAPI — datos oficiales de Pokemon
- Zod — validacion de schemas
