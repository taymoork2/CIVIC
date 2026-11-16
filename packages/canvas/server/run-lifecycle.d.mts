import type { machineFromJSON } from 'xstate'

// Plain JavaScript at runtime: Node does not strip types inside node_modules, where outside apps install the canvas.
export declare const runMachine: ReturnType<typeof machineFromJSON>
