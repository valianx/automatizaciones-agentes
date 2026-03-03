import * as fs from 'fs';
import * as path from 'path';
import type { AgentId } from './types.js';

const REPORTS_DIR = path.join(process.cwd(), 'reports');

export interface AgentReport {
    agentId: AgentId;
    timestamp: string;
    error: string;
    resolution: string;
    commands: string[];
}

// Asegurar que el directorio de reportes exista
function ensureDir() {
    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
}

// Leer todos los reportes de un agente específico
export function readReports(agentId: AgentId): AgentReport[] {
    ensureDir();
    const filePath = path.join(REPORTS_DIR, `${agentId}.json`);
    if (!fs.existsSync(filePath)) return [];
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data) as AgentReport[];
    } catch {
        return [];
    }
}

// Guardar un reporte nuevo para un agente
export function saveReport(report: AgentReport): void {
    ensureDir();
    const filePath = path.join(REPORTS_DIR, `${report.agentId}.json`);
    const existing = readReports(report.agentId);
    existing.push(report);
    // Mantener solo los últimos 10 reportes por agente
    const trimmed = existing.slice(-10);
    fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2), 'utf-8');
}

// Formatear reportes como contexto para el system prompt del agente
export function formatReportsForPrompt(agentId: AgentId): string {
    const reports = readReports(agentId);
    if (reports.length === 0) return '';

    const lines = reports.map((r, i) =>
        `--- Reporte ${i + 1} (${r.timestamp}) ---
Error: ${r.error}
Resolucion: ${r.resolution}
Comandos exitosos: ${r.commands.join(', ') || 'ninguno'}`
    ).join('\n\n');

    return `

=== REPORTES DE EJECUCIONES ANTERIORES ===
Los siguientes reportes contienen errores y resoluciones de ejecuciones pasadas.
Usa esta informacion para evitar los mismos errores y aplicar las resoluciones que funcionaron.

${lines}

=== FIN DE REPORTES ===`;
}
