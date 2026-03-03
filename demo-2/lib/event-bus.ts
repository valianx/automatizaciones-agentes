import { EventEmitter } from 'events';
import type { AgentEvent } from './types.js';

class AgentEventBus extends EventEmitter {
    emitEvent(data: AgentEvent): void {
        this.emit('agent-event', data);
    }
}

export const eventBus = new AgentEventBus();
