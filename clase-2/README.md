# Clase 2 — Infrastructure Orchestrator

Orquestador multi-agente que provisiona una VM Ubuntu 24.04 con 7 servicios usando agentes AI autonomos que ejecutan herramientas semanticas via SSH.

## Arquitectura General

```
┌──────────────────────────────────────────────────────────────┐
│                     Browser (Dashboard)                       │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  9 Agent Cards  │  Progress Bars  │  Retry Buttons   │    │
│  └──────────────────────┬──────────────────────────┬────┘    │
└─────────────────────────┼──────────────────────────┼─────────┘
                     SSE  │                     POST │
                          ▼                          ▼
┌──────────────────────────────────────────────────────────────┐
│                   Express Server (index.ts)                   │
│                                                               │
│  Endpoints:                                                   │
│    GET  /api/events      ──► SSE stream                       │
│    POST /api/provision   ──► Orchestrator.run()                │
│    POST /api/destroy     ──► Orchestrator.destroy()            │
│    POST /api/retry/:id   ──► Re-run single agent              │
│    GET  /api/vm-status   ──► VBoxManage + agent states        │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │  Event Bus  │  │ Agent State  │  │  Error Reports   │    │
│  │ (EventEmit) │  │  (.json)     │  │  (reports/*.json)│    │
│  └──────┬──────┘  └──────────────┘  └──────────────────┘    │
└─────────┼────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│                    Orchestrator                               │
│                                                               │
│  Fase 1 (bloqueante):          Fase 2 (paralelo + reintentos)│
│  ┌──────────┐                  ┌─────────────────────────┐   │
│  │ VM Agent │                  │   Ronda 1/3             │   │
│  │ (Vagrant)│                  │   Promise.allSettled([   │   │
│  └────┬─────┘                  │     PostgreSQL (AI)      │   │
│       │                        │     Redis (AI)           │   │
│       ▼                        │     RabbitMQ (AI)        │   │
│  vagrant up                    │     Node.js (AI)         │   │
│  apt-get update                │     SSH Config (AI)      │   │
│  apt-get upgrade               │     Docker (AI)          │   │
│       │                        │   ])                     │   │
│       ▼                        │                          │   │
│  VM lista ─────────────────►   │   Ronda 2/3 (solo       │   │
│                                │   agentes que fallaron)  │   │
│                                │     + pnpm (AI)          │   │
│                                │       (espera Node.js)   │   │
│                                └─────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
          │
          │  SSH (node-ssh)
          ▼
┌──────────────────────────────────────────────────────────────┐
│              Ubuntu 24.04 VM (VirtualBox)                     │
│              hostname: infra-agent                            │
│              RAM: 2GB, CPUs: 2                                │
│                                                               │
│  Servicios instalados por agentes AI:                        │
│  ┌──────────┐ ┌───────┐ ┌──────────┐ ┌────────┐            │
│  │PostgreSQL│ │ Redis │ │ RabbitMQ │ │ Docker │            │
│  │  :5432   │ │ :6379 │ │:5672/mgmt│ │        │            │
│  └──────────┘ └───────┘ └──────────┘ └────────┘            │
│  ┌──────────┐ ┌───────┐ ┌──────────┐                       │
│  │ Node.js  │ │ pnpm  │ │SSH Config│                       │
│  │ (LTS)    │ │       │ │(pwd auth)│                       │
│  └──────────┘ └───────┘ └──────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

## Agentes y Subagentes

### Jerarquia

```
Orchestrator (orquestador, no es AI)
├── VM Agent (subagente, no es AI — usa Vagrant CLI)
│   └── vagrant up / vagrant destroy
│
└── 7 Resource Agents (subagentes AI — usan generateText + tools)
    ├── PostgreSQL Agent ────── install, config, verify
    ├── Redis Agent ─────────── install, config, verify
    ├── RabbitMQ Agent ──────── install, config, users, verify
    ├── Node.js Agent ───────── add repo, install, verify
    ├── SSH Config Agent ────── edit sshd_config, verify
    ├── Docker Agent ────────── add repo, install, verify
    └── pnpm Agent ──────────── corepack enable, verify
                                (DEPENDE DE: Node.js)
```

### Grafo de Dependencias

```
         ┌──────────┐
         │ VM Agent │  (Fase 1 — bloqueante)
         └────┬─────┘
              │
    ┌─────────┼─────────────────────────────────┐
    │         │         │         │         │    │
    ▼         ▼         ▼         ▼         ▼    ▼
┌──────┐ ┌──────┐ ┌────────┐ ┌──────┐ ┌─────┐ ┌──────┐
│Postgr│ │Redis │ │RabbitMQ│ │SSH   │ │Dock-│ │NodeJS│
│ SQL  │ │      │ │        │ │Config│ │ er  │ │      │
└──────┘ └──────┘ └────────┘ └──────┘ └─────┘ └──┬───┘
                                                   │
                  (Fase 2 — paralelo)              │ depende
                                                   ▼
                                               ┌──────┐
                                               │ pnpm │
                                               └──────┘
```

### Detalle de cada Agente AI

| Agente | Pasos | Verificacion |
|--------|-------|--------------|
| **PostgreSQL** | install_package → detectar version → edit_config (listen_addresses) → append_config (pg_hba) → create_system_user → restart → enable | `psql -c "SELECT version();"` |
| **Redis** | install_package → edit_config (bind 0.0.0.0) → edit_config (protected-mode no) → restart → enable | `redis-cli ping` (PONG) |
| **RabbitMQ** | install_package (erlang + rabbitmq) → enable management → create_system_user (admin) → set_tags → set_permissions → restart → enable | `rabbitmqctl status` |
| **Node.js** | run_command (NodeSource setup) → install_package (nodejs) | `node --version` + `npm --version` |
| **SSH Config** | edit_config (PasswordAuth) → edit_config (KbdInteractive) → run_command (chpasswd) → restart sshd | `sshd -T \| grep passwordauth` |
| **Docker** | add_apt_repository (docker GPG + repo) → install_package (docker-ce, cli, containerd, buildx, compose) → usermod → enable → start | `docker --version` + `docker compose version` |
| **pnpm** | run_command (corepack enable) → run_command (corepack prepare) | `pnpm --version` |

## Tools Semanticas

Cada agente AI tiene acceso a 10 herramientas tipadas:

```
┌─────────────────────────────────────────────────────────────┐
│                    Tools disponibles                         │
│                                                              │
│  Infraestructura:                                           │
│  ┌──────────────────┐  ┌────────────────────┐              │
│  │ install_package  │  │ add_apt_repository │              │
│  │ apt-get install  │  │ GPG + sources.list │              │
│  │ + apt-lock retry │  │ + apt update       │              │
│  └──────────────────┘  └────────────────────┘              │
│  ┌──────────────────┐  ┌────────────────────┐              │
│  │ edit_config      │  │ append_config      │              │
│  │ sed -i 's|..|..' │  │ grep + tee -a      │              │
│  │                  │  │ (idempotente)      │              │
│  └──────────────────┘  └────────────────────┘              │
│  ┌──────────────────┐  ┌────────────────────┐              │
│  │ manage_service   │  │ create_system_user │              │
│  │ systemctl        │  │ comando especifico │              │
│  │ start/stop/etc   │  │ del servicio       │              │
│  └──────────────────┘  └────────────────────┘              │
│  ┌──────────────────┐  ┌────────────────────┐              │
│  │verify_installation│  │ run_command        │              │
│  │ ejecuta + valida │  │ FALLBACK: shell    │              │
│  │ marca verified   │  │ arbitrario         │              │
│  └──────────────────┘  └────────────────────┘              │
│                                                              │
│  Meta:                                                      │
│  ┌──────────────────┐  ┌────────────────────┐              │
│  │ report_progress  │  │ save_report        │              │
│  │ % al dashboard   │  │ error + resolucion │              │
│  └──────────────────┘  └────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### Flujo de ejecucion de una tool

```
AI decide llamar install_package(["postgresql"])
    │
    ▼
tracker.toolsCalled.push("install_package(postgresql)")
    │
    ▼
Construye comando: sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql
    │
    ▼
execWithAptRetry()
    │
    ├── exitCode === 0? ──► return resultado
    │
    └── stderr incluye "Could not get lock"?
        ├── retry < 5? ──► esperar (10 + retry*5)s ──► reintentar
        └── retry >= 5? ──► return ultimo resultado
```

## Flujo del Orquestador

```
POST /api/provision
        │
        ▼
┌── Orchestrator.run() ──────────────────────────────────────┐
│                                                             │
│  FASE 1: VM Agent                                          │
│  ├── vagrant up --provider=virtualbox                      │
│  ├── apt-get update                                        │
│  └── apt-get upgrade                                       │
│       │                                                     │
│       ▼ (VM lista)                                         │
│                                                             │
│  FASE 2: Ronda 1/3                                         │
│  ├── agents.filter(no verificado, deps OK)                 │
│  ├── Promise.allSettled(agents.map(a => a.run()))          │
│  ├── verified? ──► Set.add(agentId) + emit success        │
│  └── failed?   ──► log, retry en siguiente ronda           │
│       │                                                     │
│       ▼                                                     │
│  FASE 2: Ronda 2/3 (solo fallidos + nuevos habilitados)    │
│  ├── pnpm ahora corre si nodejs paso en ronda 1            │
│  └── agentes fallidos reintentan                           │
│       │                                                     │
│       ▼                                                     │
│  FASE 2: Ronda 3/3 (ultimo intento)                        │
│  └── agentes sin verificar ──► emit error                  │
│       │                                                     │
│       ▼                                                     │
│  RESUMEN: X/7 exitosos, Y errores                          │
└─────────────────────────────────────────────────────────────┘
```

## Flujo de un Agente AI (runAIAgent)

```
runAIAgent({ agentId, name, systemPrompt })
    │
    ▼
emit("Conectando agente AI...", running)
    │
    ▼
Cargar reportes previos (reports/{agentId}.json)
    │
    ▼
Construir system prompt:
  {systemPrompt del agente}
  + REGLAS CRITICAS (ejecutar todos los pasos, verify al final)
  + Reportes de errores anteriores
    │
    ▼
createSSHConnection() (retry con backoff exponencial)
    │
    ▼
createInfraTools({ ssh, emit, tracker })
    │
    ▼
generateText({
  model: openai(OPENAI_MODEL),
  stopWhen: stepCountIs(30),
  tools: infraTools + report_progress + save_report,
  prompt: "Procede con la instalacion..."
})
    │
    ▼
AI ejecuta tools en secuencia (hasta 30 pasos)
    │
    ▼
return tracker.verificationPassed  ──► boolean al orchestrator
```

## Sistema de Eventos (SSE)

```
Agente ejecuta tool
    │
    ▼
emit("Instalando: postgresql")
    │
    ▼
eventBus.emitEvent({ agentId, type, message, progress })
    │
    ├──► updateAgentState() ──► agent-state.json (persistencia)
    │
    └──► SSE broadcast ──► data: {...}\n\n ──► todos los browsers
                                                    │
                                                    ▼
                                            handleAgentEvent()
                                            ├── actualizar card
                                            ├── actualizar badge
                                            ├── actualizar progress bar
                                            └── append log line
```

## Servicios provisionados

| Servicio    | Puerto Host | Puerto VM | Credenciales           |
|-------------|-------------|-----------|------------------------|
| SSH         | 2222        | 22        | vagrant / vagrant      |
| PostgreSQL  | 5432        | 5432      | postgres / postgres    |
| Redis       | 6379        | 6379      | Sin auth               |
| RabbitMQ    | 5672        | 5672      | admin / admin          |
| RabbitMQ UI | 15672       | 15672     | admin / admin          |
| Node.js     | --          | --        | --                     |
| pnpm        | --          | --        | --                     |
| Docker      | --          | --        | vagrant (grupo docker) |

## Setup

```bash
# Requisitos: Node.js 22+, Vagrant, VirtualBox

cd clase-2
cp .env.example .env
# Editar .env con tu OPENAI_API_KEY

pnpm install
pnpm start
```

Abrir http://localhost:4000 y click "Provisionar".

## Variables de entorno

| Variable             | Default       | Descripcion                        |
|----------------------|---------------|------------------------------------|
| `OPENAI_MODEL`       | `gpt-4o-mini` | Modelo de OpenAI para los agentes  |
| `OPENAI_API_KEY`     | --            | API key de OpenAI (requerido)      |
| `PORT`               | `4000`        | Puerto del servidor                |
| `SSH_HOST`           | `127.0.0.1`   | Host SSH de la VM                  |
| `SSH_PORT`           | `2222`        | Puerto SSH de la VM                |
| `SSH_USER`           | `vagrant`     | Usuario SSH                        |
| `VAGRANT_PRIVATE_KEY`| auto          | Ruta a private key (auto-detecta)  |

## Stack

- TypeScript + tsx
- Express 5 + SSE (Server-Sent Events)
- AI SDK v6 + OpenAI (`generateText` con `stopWhen: stepCountIs`)
- node-ssh para ejecucion remota
- Vagrant + VirtualBox para la VM

## Estructura de archivos

```
clase-2/
├── index.ts                 # Express server + API + SSE
├── orchestrator.ts          # Orquestador: fases, reintentos, dependencias
├── Vagrantfile              # Configuracion de la VM
├── agents/
│   ├── vm-agent.ts          # Crea/destruye VM con Vagrant
│   ├── postgresql-agent.ts  # Instala PostgreSQL
│   ├── redis-agent.ts       # Instala Redis
│   ├── rabbitmq-agent.ts    # Instala RabbitMQ
│   ├── nodejs-agent.ts      # Instala Node.js LTS
│   ├── pnpm-agent.ts        # Instala pnpm (depende de Node.js)
│   ├── ssh-agent.ts         # Configura SSH password auth
│   └── docker-agent.ts      # Instala Docker Engine
├── lib/
│   ├── ai-agent.ts          # Runner de agentes AI (generateText)
│   ├── tools.ts             # 8 tools semanticas + tracker
│   ├── event-bus.ts         # EventEmitter para SSE
│   ├── ssh-client.ts        # Conexion SSH con retry
│   ├── agent-state.ts       # Persistencia de estado
│   ├── reports.ts           # Reportes de errores para aprendizaje
│   └── types.ts             # Tipos TypeScript
├── public/
│   └── index.html           # Dashboard (HTML/CSS/JS)
└── reports/                 # Reportes de errores (runtime)
```
