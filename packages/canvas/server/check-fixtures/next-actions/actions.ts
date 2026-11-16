'use server'
export async function save() { return await Promise.resolve(null) }
export const load = async () => await Promise.resolve(null)
const local = async () => await Promise.resolve(null)
export { local as renamed }
export const value = 1
export function sync() { return null }
