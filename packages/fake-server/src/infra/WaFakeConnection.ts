import type { WebSocket } from 'ws'

export type WaFakeConnectionState = 'open' | 'closing' | 'closed'

export interface WaFakeConnectionHandlers {
    readonly onFrame?: (frame: Uint8Array) => void
    readonly onClose?: (info: { readonly code: number; readonly reason: string }) => void
    readonly onError?: (error: Error) => void
}

export class WaFakeConnection {
    public readonly id: string
    private readonly socket: WebSocket
    private handlers: WaFakeConnectionHandlers = {}
    private currentState: WaFakeConnectionState = 'open'

    public constructor(id: string, socket: WebSocket) {
        this.id = id
        this.socket = socket
        this.bindSocketEvents()
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

    private bindSocketEvents(): void {
        this.socket.on('message', (data, isBinary) => {
            if (!isBinary) {
                this.handlers.onError?.(new Error('received unexpected text frame'))
                return
            }
            const frame = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer)
            this.handlers.onFrame?.(frame)
        })

        this.socket.on('close', (code, reasonBuf) => {
            this.currentState = 'closed'
            this.handlers.onClose?.({ code, reason: reasonBuf.toString('utf8') })
        })

        this.socket.on('error', (error) => {
            this.handlers.onError?.(error)
        })
    }
}
