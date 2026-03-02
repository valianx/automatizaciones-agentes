const fs = require('fs');

function createRect(id, x, y, width, height, text, options = {}) {
    const bgColor = options.bgColor || "#f8f9fa";
    const strokeColor = options.strokeColor || "#1e1e1e";
    const textColor = options.textColor || "#1e1e1e";
    const strokeWidth = options.strokeWidth || 1;
    const fontSize = options.fontSize || 20;

    return [
        {
            id: `rect-${id}`,
            type: "rectangle",
            x, y, width, height,
            strokeColor: strokeColor,
            backgroundColor: bgColor,
            fillStyle: "solid",
            strokeWidth: strokeWidth,
            strokeStyle: "solid",
            roughness: 0,
            opacity: 100,
            groupIds: [`group-${id}`],
            roundness: { type: 3 }
        },
        {
            id: `text-${id}`,
            type: "text",
            x: x + 10,
            y: y + (height - (fontSize * 1.25 * text.split('\n').length)) / 2,
            width: width - 20,
            height: fontSize * 1.25 * text.split('\n').length,
            strokeColor: textColor,
            backgroundColor: "transparent",
            fillStyle: "hachure",
            strokeWidth: 1,
            strokeStyle: "solid",
            roughness: 0,
            opacity: 100,
            groupIds: [`group-${id}`],
            text: text,
            fontSize: fontSize,
            fontFamily: 1,
            textAlign: "center",
            verticalAlign: "middle",
            baseline: 15,
            lineHeight: 1.25
        }
    ];
}

function createArrow(id, sx, sy, dx, dy, label, options = {}) {
    const w = dx - sx;
    const h = dy - sy;
    const arrowColor = options.arrowColor || "#1e1e1e";
    const elements = [
        {
            id: `arrow-${id}`,
            type: "arrow",
            x: sx,
            y: sy,
            width: Math.abs(w),
            height: Math.abs(h),
            strokeColor: arrowColor,
            backgroundColor: "transparent",
            fillStyle: "hachure",
            strokeWidth: 1.5,
            strokeStyle: "solid",
            roughness: 0,
            opacity: 100,
            groupIds: [],
            endArrowhead: "arrow",
            startArrowhead: null,
            points: [[0, 0], [w, h]]
        }
    ];

    if (label) {
        elements.push({
            id: `text-arrow-${id}`,
            type: "text",
            x: sx + w / 2 - 40 + (options.labelOffsetX || 0),
            y: sy + h / 2 - 10 + (options.labelOffsetY || 0),
            width: 80,
            height: 20,
            strokeColor: options.labelColor || "#c92a2a",
            backgroundColor: "transparent",
            fillStyle: "hachure",
            strokeWidth: 1,
            strokeStyle: "solid",
            roughness: 0,
            opacity: 100,
            groupIds: [],
            text: label,
            fontSize: 16,
            fontFamily: 1,
            textAlign: "center",
            verticalAlign: "middle",
            baseline: 15,
            lineHeight: 1.25
        });
    }
    return elements;
}

// Diagrama 1: Clase 1 (Tema Pokemon Agradable)
const d1 = [
    {
        id: "frame-server",
        type: "rectangle",
        x: 340, y: 70, width: 440, height: 380,
        strokeColor: "#cc0000", backgroundColor: "#fdf2f2",
        fillStyle: "solid", strokeWidth: 2, strokeStyle: "dashed",
        roughness: 0, opacity: 100, groupIds: [], roundness: { type: 3 }
    },
    {
        id: "text-server-title",
        type: "text",
        x: 360, y: 80, width: 220, height: 20,
        strokeColor: "#cc0000", backgroundColor: "transparent",
        fillStyle: "hachure", strokeWidth: 1, strokeStyle: "solid",
        roughness: 0, opacity: 100, groupIds: [],
        text: "⚡ Poké-Express Server",
        fontSize: 20, fontFamily: 1, textAlign: "left", verticalAlign: "top", baseline: 15
    },

    ...createRect("ui", 50, 200, 240, 90, "📱 Pokedex UI\n(Browser)", { bgColor: "#cc0000", textColor: "#ffffff", strokeWidth: 2, strokeColor: "#880000", fontSize: 20 }),

    ...createRect("agent", 420, 140, 280, 80, "🧑‍🔬 Pokémon Agent\n(ToolLoopAgent)", { bgColor: "#ffcc00", textColor: "#000000", strokeWidth: 2, strokeColor: "#b38f00", fontSize: 20 }),

    ...createRect("tool", 420, 310, 280, 80, "🛠️ Tool:\nobtener_datos_pokemon", { bgColor: "#3b4cca", textColor: "#ffffff", strokeWidth: 2, strokeColor: "#2a378e", fontSize: 18 }),

    ...createRect("valkey", 850, 180, 260, 90, "🗄️ Valkey (Redis)\n(Caché / Histórico)", { bgColor: "#ffffff", textColor: "#cc0000", strokeWidth: 2, strokeColor: "#cc0000" }),

    ...createRect("pokeapi", 850, 340, 260, 90, "🌐 PokeAPI\n(Datos Oficiales)", { bgColor: "#e6f0ff", textColor: "#3b4cca", strokeWidth: 2, strokeColor: "#3b4cca" }),

    ...createArrow("ui-server", 290, 245, 340, 245, "POST /api/chat", { labelOffsetY: -20, labelOffsetX: 0, labelColor: "#555" }),

    ...createArrow("agent-tool", 560, 220, 560, 310, "usa", { labelOffsetX: 25, labelOffsetY: 0, labelColor: "#555" }),

    ...createArrow("tool-valkey", 700, 330, 850, 230, "1. Cache lookup", { labelColor: "#cc0000", labelOffsetY: -25, labelOffsetX: -20 }),
    ...createArrow("tool-pokeapi", 700, 360, 850, 385, "2. Si hay miss", { labelColor: "#3b4cca", labelOffsetY: 20, labelOffsetX: -20 }),
];

fs.writeFileSync("c:/Users/mario/projects/agents/clase-1-agents.excalidraw", JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements: d1,
    appState: { viewBackgroundColor: "#f6f8fa" }
}, null, 2));

// Diagrama 2: Clase 2 (Organizado y con Temática)
const d2 = [
    {
        id: "frame-fase2",
        type: "rectangle",
        x: 390, y: 190, width: 860, height: 400,
        strokeColor: "#1565c0", backgroundColor: "#f3f8ff",
        fillStyle: "solid", strokeWidth: 2, strokeStyle: "dashed",
        roughness: 0, opacity: 100, groupIds: [], roundness: { type: 3 }
    },
    {
        id: "text-fase2-title",
        type: "text",
        x: 410, y: 200, width: 300, height: 20,
        strokeColor: "#1565c0", backgroundColor: "transparent",
        fillStyle: "hachure", strokeWidth: 1, strokeStyle: "solid",
        roughness: 0, opacity: 100, groupIds: [],
        text: "⚡ Fase 2: Ejecución Paralela (AI Agents)",
        fontSize: 18, fontFamily: 1, textAlign: "left", verticalAlign: "top", baseline: 15, lineHeight: 1.25
    },

    ...createRect("orch", 480, 50, 400, 80, "⚙️ Orchestrator\n(TypeScript Orquestador)", { bgColor: "#e0d4f7", strokeColor: "#5e35b1", textColor: "#311b92", fontSize: 20, strokeWidth: 2 }),

    // Fase 1
    {
        id: "frame-fase1",
        type: "rectangle",
        x: 60, y: 190, width: 280, height: 160,
        strokeColor: "#e65100", backgroundColor: "#fff3e0",
        fillStyle: "solid", strokeWidth: 2, strokeStyle: "dashed",
        roughness: 0, opacity: 100, groupIds: [], roundness: { type: 3 }
    },
    {
        id: "text-fase1-title",
        type: "text",
        x: 80, y: 200, width: 200, height: 20,
        strokeColor: "#e65100", backgroundColor: "transparent",
        fillStyle: "hachure", strokeWidth: 1, strokeStyle: "solid",
        roughness: 0, opacity: 100, groupIds: [],
        text: "🧱 Fase 1: Bloqueante",
        fontSize: 18, fontFamily: 1, textAlign: "left", verticalAlign: "top", baseline: 15, lineHeight: 1.25
    },

    // Subagente no AI
    ...createRect("vmagent", 80, 240, 240, 80, "🖥️ VM Agent\n(No AI, Vagrant CLI)", { bgColor: "#ffffff", strokeColor: "#e65100", textColor: "#b33c00", strokeWidth: 2 }),

    // Subagentes AI (Fase 2)
    ...createRect("pg", 420, 240, 240, 80, "🐘 PostgreSQL Agent\n(AI Agent)", { bgColor: "#ffffff", strokeColor: "#0277bd", textColor: "#01579b", strokeWidth: 2 }),
    ...createRect("redis", 700, 240, 240, 80, "🟥 Redis Agent\n(AI Agent)", { bgColor: "#ffffff", strokeColor: "#c62828", textColor: "#b71c1c", strokeWidth: 2 }),
    ...createRect("rmq", 980, 240, 240, 80, "🐰 RabbitMQ Agent\n(AI Agent)", { bgColor: "#ffffff", strokeColor: "#ef6c00", textColor: "#e65100", strokeWidth: 2 }),

    ...createRect("node", 420, 350, 240, 80, "🟩 Node.js Agent\n(AI Agent)", { bgColor: "#ffffff", strokeColor: "#2e7d32", textColor: "#1b5e20", strokeWidth: 2 }),
    ...createRect("ssh", 700, 350, 240, 80, "🔑 SSH Config Agent\n(AI Agent)", { bgColor: "#ffffff", strokeColor: "#455a64", textColor: "#263238", strokeWidth: 2 }),
    ...createRect("docker", 980, 350, 240, 80, "🐳 Docker Agent\n(AI Agent)", { bgColor: "#ffffff", strokeColor: "#0277bd", textColor: "#01579b", strokeWidth: 2 }),

    ...createRect("pnpm", 700, 480, 240, 80, "📦 pnpm Agent\n(AI Agent)", { bgColor: "#ffffff", strokeColor: "#f57c00", textColor: "#e65100", strokeWidth: 2 }),

    // Flechas desde Orquestador a Fases
    ...createArrow("orch-fase1", 540, 130, 200, 190, "Espera primero", { labelOffsetY: -20, labelOffsetX: -20, labelColor: "#e65100", arrowColor: "#e65100" }),
    ...createArrow("orch-fase2", 680, 130, 680, 190, "Dispara en paralelo", { labelOffsetX: 80, labelOffsetY: 0, labelColor: "#1565c0", arrowColor: "#1565c0" }),

    // Flecha de dependencia dentro de fase 2
    ...createArrow("node-pnpm", 540, 430, 700, 480, "Depende", { labelOffsetX: 20, labelOffsetY: -20, labelColor: "#2e7d32", arrowColor: "#2e7d32" }),
];

fs.writeFileSync("c:/Users/mario/projects/agents/clase-2-agents.excalidraw", JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements: d2,
    appState: { viewBackgroundColor: "#ffffff" }
}, null, 2));

console.log("Diagrams generated successfully!");
