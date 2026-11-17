import { Rpc as R, RpcGroup } from '@effect/rpc'

export const list = R.make('account.list', {})
export const save = R.make('account.save', {})
export const remove = R.make('account.remove', {})
export class Accounts extends RpcGroup.make(list, save, remove) {}
R.make(computed, {})
// R.make('commented', {})
