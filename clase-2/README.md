# Clase 2 — Infrastructure Orchestrator

Orquestador de infraestructura que provisiona una VM Ubuntu 24.04 con 7 servicios usando agentes AI autonomos.

## Arquitectura

```
Dashboard (browser)
    │ SSE
    ▼
Express Server ──► Orchestrator
                      │
              ┌───────┼───────────────────────┐
              ▼       ▼       ▼       ▼       ▼
           VM Agent   PostgreSQL  Redis  RabbitMQ  ...
              │       (AI)     (AI)    (AI)
              │         │        │       │
              ▼         ▼        ▼       ▼
           Vagrant    SSH ──► Ubuntu 24.04 VM
```

**Fase 1**: VM Agent crea la VM con Vagrant + VirtualBox (bloqueante).

**Fase 2**: 7 agentes AI corren en paralelo via SSH. Cada uno ejecuta tools semanticas (`install_package`, `edit_config`, `manage_service`, etc.) para instalar y configurar su servicio.

**Reintentos**: El orquestador ejecuta hasta 3 rondas. Si un agente no pasa `verify_installation`, se reintenta en la siguiente ronda. pnpm espera a que Node.js este verificado antes de correr.

## Servicios provisionados

| Servicio    | Puerto | Credenciales           |
|-------------|--------|------------------------|
| SSH         | 2222   | vagrant / vagrant      |
| PostgreSQL  | 5432   | postgres / postgres    |
| Redis       | 6379   | Sin auth               |
| RabbitMQ    | 5672   | admin / admin          |
| RabbitMQ UI | 15672  | admin / admin          |
| Node.js     | --     | --                     |
| pnpm        | --     | --                     |
| Docker      | --     | vagrant (grupo docker) |

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

## Tools semanticas

Los agentes AI usan herramientas tipadas en vez de comandos shell crudos:

- `install_package` — apt-get install con retry automatico si apt esta bloqueado
- `add_apt_repository` — GPG key + sources list + apt update
- `edit_config` — sed sobre archivos de configuracion
- `append_config` — agregar linea idempotente
- `manage_service` — systemctl (start/stop/restart/enable)
- `create_system_user` — crear usuario en un servicio
- `verify_installation` — verificar que el servicio funciona
- `run_command` — fallback para comandos arbitrarios

## Stack

- TypeScript + tsx
- Express + SSE (Server-Sent Events)
- AI SDK v6 + OpenAI (`generateText` con `stopWhen`)
- node-ssh para ejecucion remota
- Vagrant + VirtualBox para la VM
