import type { WaFakeConnectionPipeline } from '../infra/WaFakeConnectionPipeline'
import type { WaFakeIqMatcher, WaFakeIqResponder } from '../protocol/iq/router'
import type { BinaryNode } from '../transport/codec'

/** Narrow contract to avoid a circular dependency on `FakeWaServer`. */
export interface ScenarioServer {
    registerIqHandler(
        matcher: WaFakeIqMatcher,
        respond: WaFakeIqResponder,
        label?: string
    ): () => void
    onAuthenticatedPipeline(listener: AuthenticatedPipelineListener): () => void
}

export type AuthenticatedPipelineListener = (
    pipeline: WaFakeConnectionPipeline
) => void | Promise<void>

export class Scenario {
    public constructor(private readonly server: ScenarioServer) {}

    public onIq(matcher: WaFakeIqMatcher): IqExpectation {
        return new IqExpectation(this.server, matcher)
    }

    public afterAuth(listener: AuthenticatedPipelineListener): void {
        this.server.onAuthenticatedPipeline(listener)
    }
}

export class IqExpectation {
    public constructor(
        private readonly server: ScenarioServer,
        private readonly matcher: WaFakeIqMatcher
    ) {}

    public respondWith(response: BinaryNode): this {
        this.server.registerIqHandler(this.matcher, () => response)
        return this
    }

    public respond(responder: WaFakeIqResponder): this {
        this.server.registerIqHandler(this.matcher, responder)
        return this
    }

    public respondOnce(response: BinaryNode | WaFakeIqResponder): this {
        const unregister = this.server.registerIqHandler(this.matcher, async (iq) => {
            unregister()
            return typeof response === 'function' ? response(iq) : response
        })
        return this
    }
}
