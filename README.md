# Taller de Agentes de IA

Repositorio con los proyectos de un taller practico de 3 clases enfocado en desarrollo, orquestacion y despliegue de agentes de Inteligencia Artificial usando TypeScript y AI SDK v6.

## Estructura del Repositorio

```
agents/
├── clase-1/   ── Chatbot Pokedex (agente unico)
├── clase-2/   ── Infrastructure Orchestrator (multi-agente)
└── clase-3/   ── (proximamente)
```

## Clases

### [Clase 1 — Pokedex AI Agent](clase-1/)

Chatbot con un agente AI que actua como el Profesor Oak, especializado en datos Pokemon con persistencia de conversaciones.

- **Arquitectura:** 1 agente (`ToolLoopAgent`) con 1 tool (`obtener_datos_pokemon`)
- **Stack:** Express 5, AI SDK v6, OpenAI gpt-4o-mini, Valkey/Redis, PokeAPI
- **Puerto:** http://localhost:3000

### [Clase 2 — Infrastructure Orchestrator](clase-2/)

Orquestador multi-agente que provisiona una VM Ubuntu 24.04 con 7 servicios usando agentes AI autonomos que ejecutan herramientas semanticas via SSH.

- **Arquitectura:** 1 orquestador + 1 VM agent + 7 resource agents AI en paralelo con reintentos
- **Stack:** Express 5, AI SDK v6, OpenAI, node-ssh, Vagrant + VirtualBox, SSE
- **Servicios:** PostgreSQL, Redis, RabbitMQ, Node.js, pnpm, Docker, SSH Config
- **Puerto:** http://localhost:4000

### Clase 3 — Agentes Avanzados (Skills y MCP)

*Proximamente.* Sistema multi-agente con Skills y protocolo MCP.

## Requisitos

- Node.js 22+
- pnpm
- OpenAI API key
- Vagrant + VirtualBox (solo clase 2)
- Valkey/Redis (solo clase 1)

## Quick Start

```bash
# Clase 1
cd clase-1
cp .env.example .env    # agregar OPENAI_API_KEY
pnpm install
pnpm start              # http://localhost:3000

# Clase 2
cd clase-2
cp .env.example .env    # agregar OPENAI_API_KEY
pnpm install
pnpm start              # http://localhost:4000
```

## Stack

- **Lenguaje:** TypeScript + tsx (ejecucion directa sin build)
- **AI:** [AI SDK v6](https://ai-sdk.dev) + OpenAI (`generateText`, `ToolLoopAgent`, `stepCountIs`)
- **Server:** Express 5
- **Runtime:** Node.js 22+
- **Package Manager:** pnpm
