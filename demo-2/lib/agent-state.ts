import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { AgentId, AgentStatus } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, '..', 'agent-state.json');

export interface AgentState {
    status: AgentStatus;
    lastMessage: string;
    progress: number;
    updatedAt: number;
}

type StateMap = Partial<Record<AgentId, AgentState>>;

let state: StateMap = loadFromDisk();

function loadFromDisk(): StateMap {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }
    } catch { /* ignore corrupt file */ }
    return {};
}

function saveToDisk(): void {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch { /* ignore write errors */ }
}

export function updateAgentState(agentId: AgentId, status: AgentStatus | undefined, message: string, progress?: number): void {
    const prev = state[agentId];
    state[agentId] = {
        status: status ?? prev?.status ?? 'running',
        lastMessage: message,
        progress: progress ?? prev?.progress ?? 0,
        updatedAt: Date.now(),
    };
    saveToDisk();
}

export function getAgentStates(): StateMap {
    return { ...state };
}

export function clearAgentStates(): void {
    state = {};
    saveToDisk();
}
