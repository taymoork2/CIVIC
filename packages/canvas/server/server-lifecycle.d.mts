import type { machineFromJSON } from 'xstate'

export declare const deadlines: { boot: number; firstClient: number; ping: number; clientExpiry: number; grace: number; drain: number; close: number }
export declare function serverLifecycle(time?: typeof deadlines): ReturnType<typeof machineFromJSON>
export declare const serverMachine: ReturnType<typeof machineFromJSON>
