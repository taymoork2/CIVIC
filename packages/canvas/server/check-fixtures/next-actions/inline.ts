// 'use server'
const text = "contains 'use server'"
export async function ordinary() { return await Promise.resolve(text) }
export async function action() { 'use server'; return await Promise.resolve('é') }
export const arrow = async () => { 'use server'; return await Promise.resolve(null) }
