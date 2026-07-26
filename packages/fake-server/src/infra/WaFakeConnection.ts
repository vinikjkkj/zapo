export type WaFakeConnectionState = 'open' | 'closing' | 'closed'

export interface WaFakeConnectionHandlers {
    readonly onFrame?: (frame: Uint8Array) => void
    readonly onClose?: (info: { readonly code: number; readonly reason: string }) => void
    readonly onError?: (error: Error) => void
}

/** Events a carrier adapter pushes into the connection it backs. */
export interface WaFakeSocketEvents {
    readonly onFrame: (frame: Uint8Array) => void
    readonly onClose: (info: { readonly code: number; readonly reason: string }) => void
    readonly onError: (error: Error) => void
}

/**
 * Carrier a connection speaks over. Each transport adapts its own quirks (the
 * WebSocket fragment array, the absence of close codes on a TCP stream) behind
 * this interface, so every layer above stays carrier-agnostic: the WebSocket
 * listener serves companions, the TCP listener serves the mobile transport.
 */
export interface WaFakeSocketLike {
    readonly send: (frame: Uint8Array) => void
    readonly close: (code: number, reason: string) => void
    readonly listen: (events: WaFakeSocketEvents) => void
}

export class WaFakeConnection {
    public readonly id: string
    private readonly socket: WaFakeSocketLike
    private handlers: WaFakeConnectionHandlers = {}
    private currentState: WaFakeConnectionState = 'open'

    public constructor(id: string, socket: WaFakeSocketLike) {
        this.id = id
        this.socket = socket
        this.socket.listen({
            onFrame: (frame) => this.handlers.onFrame?.(frame),
            onClose: (info) => {
                this.currentState = 'closed'
                this.handlers.onClose?.(info)
            },
            onError: (error) => this.handlers.onError?.(error)
        })
    }

    public get state(): WaFakeConnectionState {
        return this.currentState
    }

    public setHandlers(handlers: WaFakeConnectionHandlers): void {
        this.handlers = handlers
    }

    public sendFrame(frame: Uint8Array): void {
        if (this.currentState !== 'open') {
            throw new Error(`cannot send frame on connection in state "${this.currentState}"`)
        }
        this.socket.send(frame)
    }

    public close(code = 1000, reason = ''): void {
        if (this.currentState === 'closed' || this.currentState === 'closing') {
            return
        }
        this.currentState = 'closing'
        this.socket.close(code, reason)
    }
}
