import type { WaVoipDeps } from '../types.js'

/** Our own jid as the credentials name it, lid first; empty before login. */
export function selfJidOf(deps: Pick<WaVoipDeps, 'authClient'>): string {
    const creds = deps.authClient.getCurrentCredentials()
    return creds?.meLid || creds?.meJid || ''
}
