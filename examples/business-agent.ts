import { WaBusinessAgentError, type WaClient } from 'zapo-js'

/**
 * Read-only account inspection. Call after pairing a dedicated, eligible Business account.
 * Integrate into your existing client entry point: await inspectBusinessAgent(client).
 * Never attach another process to a production session's saved credentials.
 */
export async function inspectBusinessAgent(client: WaClient): Promise<void> {
    try {
        const eligibility = await client.businessAgent.getEligibility()
        const availability = await client.businessAgent.getAvailability()
        const gate = await client.businessAgent.getResponseSettingsAvailability()
        const settings = await client.businessAgent.getResponseSettings()
        console.log({ eligibility, availability, gate, settings })
    } catch (error) {
        if (!(error instanceof WaBusinessAgentError)) throw error
        console.error({
            code: error.code,
            serverCode: error.serverCode,
            retryAfterMs: error.retryAfterMs
        })
        process.exitCode = 1
    }
}
