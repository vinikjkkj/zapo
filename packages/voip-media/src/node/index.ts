import type { WaMediaHost } from '../host.js'

import { nodeCrypto } from './crypto.js'
import { createWrtcPeerConnection } from './peer-connection.js'

export { nodeCrypto } from './crypto.js'
export { createWrtcPeerConnection } from './peer-connection.js'
export {
    RAW_UDP_NO_RETURN_PATH,
    RAW_UDP_RETURN_PATH_STALL_MS,
    RAW_UDP_RETURN_PATH_TIMEOUT_MS,
    WaRawUdpLeg
} from './WaRawUdpLeg.js'
export type { WaRawUdpLegOptions } from './WaRawUdpLeg.js'

/**
 * Media on Node: `node:crypto` and `@roamhq/wrtc`. Raw UDP legs stay off; a
 * host that wants them passes `createRawUdpLeg: (options) => new WaRawUdpLeg(options)`.
 */
export const nodeMediaHost: WaMediaHost = Object.freeze({
    crypto: nodeCrypto,
    createPeerConnection: createWrtcPeerConnection
})
