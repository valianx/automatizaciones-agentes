# Curso / Taller de Agentes de IA

Este repositorio contiene los proyectos y materiales para un taller práctico de 3 clases enfocado en el desarrollo, orquestación y despliegue de agentes de Inteligencia Artificial.

## Descripción del Proyecto

A lo largo de este curso, exploraremos diferentes arquitecturas y casos de uso de agentes de IA. Comenzaremos desde la creación de chatbots de un solo agente con conocimientos específicos, avanzaremos hacia la automatización de infraestructura utilizando sistemas multi-agente (DevOps), y finalmente integraremos capacidades avanzadas mediante el uso de Skills y el protocolo MCP (Model Context Protocol).

## Estructura de las Clases

### Clase 1: Chatbot Funcional (Agente Especialista)
**Objetivo:** Desarrollar y desplegar un chatbot interactivo.
*   **Descripción:** En esta primera clase construiremos un agente especializado en un dominio específico. El objetivo será levantar un chatbot que actúe como un experto y pueda responder de manera fluida preguntas detalladas sobre el universo de los Pokemones. 

### Clase 2: Operaciones Multi-Agente (DevOps)
**Objetivo:** Automatización de infraestructura con múltiples agentes.
*   **Descripción:** Aplicaremos el trabajo colaborativo entre agentes al área de operaciones (DevOps). Implementaremos un sistema multi-agente capaz de provisionar (levantar) una Máquina Virtual (VM) de manera autónoma, para luego ingresar y ejecutar diversas configuraciones internas, dejando el entorno operativo y listo para su uso.

### Clase 3: Agentes Avanzados (Skills y MCP)
**Objetivo:** Extender las capacidades de los agentes usando flujos complejos.
*   **Descripción:** La clase final se enfoca en la integración avanzada de herramientas. Implementaremos un sistema multi-agente que utilice y coordine diversas *Skills* (habilidades predefinidas). Además, trabajaremos con el protocolo MCP, levantando nuestro propio servidor para dotar a los agentes de contexto y herramientas externas de forma estandarizada.

## Requisitos Previos e Instalación

Para este taller utilizaremos **TypeScript** como lenguaje principal. TypeScript es una excelente elección para el desarrollo de agentes de IA porque:
1.  **Tipado estático:** Ayuda a prevenir errores comunes al manejar respuestas complejas de los LLM (como JSON estructurados).
2.  **Ecosistema:** Las principales librerías de IA (como LangChain.js, Vercel AI SDK, y los SDKs del Model Context Protocol) tienen soporte de primera clase para TypeScript.
3.  **Integración:** Es ideal tanto para el backend (Node.js/Deno/Bun) como para construir interfaces web para interactuar con los agentes.

*(La información exacta de configuración, instalación de Node.js/Bun y dependencias se irá agregando a medida que se desarrollen las clases).*
