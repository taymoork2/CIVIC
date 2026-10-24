export interface Facts { node: string; git: boolean; pnpm: boolean; chrome: boolean; installed: boolean }
export interface Check { name: string; ok: boolean; required: boolean; found?: string; fix: string }
export function gather(env?: NodeJS.ProcessEnv): Facts
export function judge(facts: Facts): Check[]
