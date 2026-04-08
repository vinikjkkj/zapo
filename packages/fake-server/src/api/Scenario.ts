/**
 * Scenario builder — ergonomic API for scripting fake server behavior in tests.
 *
 * The builder is a thin sugar layer on top of `FakeWaServer.registerIqHandler`
 * and the pipeline event hooks. It exists so test files can stay declarative:
 *
 *   await server.scenario((s) => {
 *       s.onIq({ xmlns: 'usync' }).respondWith(buildUsyncResult([...]))
 *       s.onIq({ xmlns: 'privacy' }).respondOnce({ tag: 'iq', attrs: ... })
 *       s.afterAuth(async (pipeline) => {
 *           await pipeline.sendStanza(buildIncomingMessage(...))
 *       })
 *   })
 *
 * Every method on the builder returns either a chainable expectation or
 * `void`, never the underlying handler instance — keep the surface narrow
 * so tests are easy to read.
 */

import type { WaFakeConnectionPipeline } from '../infra/WaFakeConnectionPipeline'
import type { WaFakeIqMatcher, WaFakeIqResponder } from '../protocol/iq/router'
import type { BinaryNode } from '../transport/codec'

/**
 * Minimal subset of `FakeWaServer` the scenario builder needs. Defining it
 * as an interface (rather than importing the concrete class) keeps the
 * `Scenario` and `IqExpectation` classes free of a circular dependency on
 * `FakeWaServer.ts`.
 */
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

    /**
     * Declares an expectation for an inbound IQ that matches the given
     * pattern. Returns a chainable `IqExpectation` so the caller can attach
     * a response (or omit it to leave the handler dormant — useful with
     * `expectIq` assertions).
     */
    public onIq(matcher: WaFakeIqMatcher): IqExpectation {
        return new IqExpectation(this.server, matcher)
    }

    /**
     * Registers a callback fired once each pipeline reaches the
     * `authenticated` state (i.e. after the noise handshake completes and
     * the success node has been pushed). The callback receives the live
     * pipeline so it can push stanzas, snapshot state, etc.
     */
    public afterAuth(listener: AuthenticatedPipelineListener): void {
        this.server.onAuthenticatedPipeline(listener)
    }
}

export class IqExpectation {
    public constructor(
        private readonly server: ScenarioServer,
        private readonly matcher: WaFakeIqMatcher
    ) {}

    /** Responds with a fixed stanza for every matching IQ. */
    public respondWith(response: BinaryNode): this {
        this.server.registerIqHandler(this.matcher, () => response)
        return this
    }

    /** Responds dynamically — the responder is called per matching IQ. */
    public respond(responder: WaFakeIqResponder): this {
        this.server.registerIqHandler(this.matcher, responder)
        return this
    }

    /**
     * Responds **only to the first** matching IQ; the handler removes
     * itself afterwards. Subsequent IQs that match the same matcher fall
     * through to other handlers (or `onUnhandled`).
     */
    public respondOnce(response: BinaryNode | WaFakeIqResponder): this {
        let consumed = false
        const unregister = this.server.registerIqHandler(this.matcher, async (iq) => {
            consumed = true
            unregister()
            return typeof response === 'function' ? response(iq) : response
        })
        // Ensure the closure is reachable for tooling — avoid `consumed` being
        // flagged as unused.
        void consumed
        return this
    }
}
