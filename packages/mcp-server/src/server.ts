import {
    createServer as createHttpServer,
    type IncomingMessage,
    type Server as NodeHttpServer,
    type ServerResponse
} from 'node:http'

import { toError } from 'zapo-js/util'

import { buildRuntimeConfigFromEnv, McpRuntime, type RuntimeConfig } from './runtime'
import { encodeForJson } from './serializer'
import { type ToolDefinition, TOOLS } from './tools'

interface SdkBundle {
    readonly Server: new (
        info: { name: string; version: string },
        options: { capabilities: { tools: Record<string, unknown> } }
    ) => SdkServer
    readonly StdioServerTransport: new () => SdkTransport
    readonly StreamableHTTPServerTransport: new (options: {
        sessionIdGenerator: undefined | (() => string)
    }) => SdkHttpTransport
    readonly ListToolsRequestSchema: unknown
    readonly CallToolRequestSchema: unknown
}

interface SdkServer {
    setRequestHandler(schema: unknown, handler: (request: unknown) => Promise<unknown>): void
    connect(transport: SdkTransport | SdkHttpTransport): Promise<void>
    close(): Promise<void>
}

interface SdkTransport {
    /* opaque */
}

interface SdkHttpTransport {
    handleRequest(req: IncomingMessage, res: ServerResponse, body?: unknown): Promise<void>
    close(): Promise<void>
}

const loadSdk = async (): Promise<SdkBundle> => {
    // The MCP SDK is ESM-only and uses subpath exports with `.js` suffix.
    // eslint-plugin-import's resolver does not currently follow these exports
    // for dynamic-import call sites, so suppress the unresolved warnings. The
    // bundles are validated at runtime by the smoke tests.
    /* eslint-disable import/no-unresolved */
    const [serverModule, stdioModule, httpModule, typesModule] = await Promise.all([
        import('@modelcontextprotocol/sdk/server/index.js'),
        import('@modelcontextprotocol/sdk/server/stdio.js'),
        import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
        import('@modelcontextprotocol/sdk/types.js')
    ])
    /* eslint-enable import/no-unresolved */
    return {
        Server: (serverModule as { Server: SdkBundle['Server'] }).Server,
        StdioServerTransport: (
            stdioModule as { StdioServerTransport: SdkBundle['StdioServerTransport'] }
        ).StdioServerTransport,
        StreamableHTTPServerTransport: (
            httpModule as {
                StreamableHTTPServerTransport: SdkBundle['StreamableHTTPServerTransport']
            }
        ).StreamableHTTPServerTransport,
        ListToolsRequestSchema: (typesModule as { ListToolsRequestSchema: unknown })
            .ListToolsRequestSchema,
        CallToolRequestSchema: (typesModule as { CallToolRequestSchema: unknown })
            .CallToolRequestSchema
    }
}

/** Server-info overrides surfaced to the MCP client during initialize. */
export interface RunMcpServerOptions {
    /** Server name shown in the MCP client UI. Defaults to `'@zapo-js/mcp-server'`. */
    readonly name?: string
    /** Server version. Defaults to `'0.0.0'`. */
    readonly version?: string
}

const buildMcpServer = (
    sdk: SdkBundle,
    runtime: McpRuntime,
    options: RunMcpServerOptions
): SdkServer => {
    const server = new sdk.Server(
        {
            name: options.name ?? '@zapo-js/mcp-server',
            version: options.version ?? '0.0.0'
        },
        { capabilities: { tools: {} } }
    )

    const toolsByName = new Map<string, ToolDefinition>()
    for (const tool of TOOLS) {
        toolsByName.set(tool.name, tool)
    }

    server.setRequestHandler(sdk.ListToolsRequestSchema, async () => {
        return {
            tools: TOOLS.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema
            }))
        }
    })

    server.setRequestHandler(sdk.CallToolRequestSchema, async (request) => {
        const req = request as { params: { name: string; arguments?: unknown } }
        const tool = toolsByName.get(req.params.name)
        if (!tool) {
            return {
                isError: true,
                content: [{ type: 'text', text: `unknown tool "${req.params.name}"` }]
            }
        }
        try {
            const result = await tool.handler(req.params.arguments ?? {}, runtime)
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(encodeForJson(result), null, 2)
                    }
                ]
            }
        } catch (error) {
            const err = toError(error)
            runtime.getLogger().warn('tool handler failed', {
                tool: tool.name,
                message: err.message
            })
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            encodeForJson({
                                error: {
                                    name: err.name,
                                    message: err.message,
                                    stack: err.stack
                                }
                            }),
                            null,
                            2
                        )
                    }
                ]
            }
        }
    })

    return server
}

const runStdioTransport = async (
    sdk: SdkBundle,
    runtime: McpRuntime,
    options: RunMcpServerOptions
): Promise<{ shutdown: () => Promise<void> }> => {
    const server = buildMcpServer(sdk, runtime, options)
    const transport = new sdk.StdioServerTransport()
    await server.connect(transport)
    runtime.getLogger().info('mcp server connected via stdio')
    return {
        shutdown: async () => {
            try {
                await server.close()
            } catch {
                /* swallow */
            }
        }
    }
}

const readJsonBody = (req: IncomingMessage): Promise<unknown> => {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []
        let total = 0
        let settled = false
        const MAX_BODY = 8 * 1024 * 1024
        const settle = (fn: () => void): void => {
            if (settled) return
            settled = true
            fn()
        }
        req.on('data', (chunk: Buffer) => {
            total += chunk.length
            if (total > MAX_BODY) {
                req.destroy(new Error('request body too large'))
                return
            }
            chunks.push(chunk)
        })
        req.on('end', () => {
            settle(() => {
                const raw = Buffer.concat(chunks).toString('utf8')
                if (raw.length === 0) {
                    resolve(undefined)
                    return
                }
                try {
                    resolve(JSON.parse(raw))
                } catch (error) {
                    reject(error instanceof Error ? error : new Error(String(error)))
                }
            })
        })
        req.on('error', (err) => settle(() => reject(err)))
        // Connection went away mid-upload (client closed, network reset, ...).
        // Without these handlers neither `end` nor `error` necessarily fires
        // and the Promise hangs the request handler forever.
        req.on('aborted', () => settle(() => reject(new Error('request aborted by client'))))
        req.on('close', () =>
            settle(() => reject(new Error('request closed before body finished')))
        )
    })
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1'])

const runHttpTransport = async (
    sdk: SdkBundle,
    runtime: McpRuntime,
    options: RunMcpServerOptions,
    config: Pick<RuntimeConfig, 'httpHost' | 'httpPort' | 'httpPath'>
): Promise<{ shutdown: () => Promise<void>; httpServer: NodeHttpServer }> => {
    const route = config.httpPath
    if (!LOOPBACK_HOSTS.has(config.httpHost)) {
        // The HTTP transport has no auth and the `call` tool exposes the entire
        // WaClient + zapo-js surface. Binding to a non-loopback interface puts
        // that on the network – definitely not what you want by accident.
        runtime.getLogger().warn('mcp http transport bound to non-loopback host without auth', {
            host: config.httpHost,
            port: config.httpPort,
            advice: 'switch back to MCP_HTTP_HOST=127.0.0.1 unless you have a reverse proxy enforcing auth'
        })
    }
    const httpServer = createHttpServer(async (req, res) => {
        const url = req.url ?? ''
        const pathOnly = url.split('?')[0]
        if (pathOnly !== route) {
            res.writeHead(404, { 'content-type': 'application/json' }).end(
                JSON.stringify({ error: 'not found', expected: route })
            )
            return
        }
        if (req.method !== 'POST') {
            res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' }).end(
                JSON.stringify({ error: 'method not allowed; use POST' })
            )
            return
        }
        let body: unknown
        try {
            body = await readJsonBody(req)
        } catch (error) {
            res.writeHead(400, { 'content-type': 'application/json' }).end(
                JSON.stringify({ error: 'invalid json body', message: toError(error).message })
            )
            return
        }

        // Stateless on purpose: each request gets a fresh Server + transport
        // pair. The actual MCP session state (WaClient, event/log buffers) is
        // shared via the singleton `runtime`, so request-scoped objects only
        // carry protocol plumbing. This also makes nodemon-style restarts
        // free of session-id bookkeeping (no client to invalidate). If we
        // ever want true MCP `mcp-session-id` resume we'd swap to a session
        // map keyed by sessionIdGenerator + that header.
        const server = buildMcpServer(sdk, runtime, options)
        const transport = new sdk.StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        res.on('close', () => {
            transport.close().catch(() => undefined)
            server.close().catch(() => undefined)
        })
        try {
            await server.connect(transport)
            await transport.handleRequest(req, res, body)
        } catch (error) {
            const err = toError(error)
            runtime.getLogger().warn('http request failed', { message: err.message })
            if (!res.headersSent) {
                res.writeHead(500, { 'content-type': 'application/json' }).end(
                    JSON.stringify({ error: 'internal', message: err.message })
                )
            }
        }
    })

    await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject)
        httpServer.listen(config.httpPort, config.httpHost, () => {
            httpServer.off('error', reject)
            resolve()
        })
    })
    runtime.getLogger().info('mcp server listening', {
        url: `http://${config.httpHost}:${config.httpPort}${route}`
    })

    return {
        httpServer,
        shutdown: async () => {
            await new Promise<void>((resolve) => {
                httpServer.close(() => resolve())
            })
        }
    }
}

/**
 * Boots an MCP server that exposes a single `WaClient` instance plus
 * helpers (`call`, `inspect`, `events`, `logs`, `lifecycle`, `restart`)
 * as MCP tools. Reads its config from environment variables via
 * {@link buildRuntimeConfigFromEnv} - set `MCP_TRANSPORT=http` to switch
 * from stdio (default) to a Streamable-HTTP server.
 *
 * Used by the published `zapo-mcp-server` binary; you only need to call
 * it directly when embedding the server in another process.
 */
export const runMcpServer = async (options: RunMcpServerOptions = {}): Promise<void> => {
    const config = buildRuntimeConfigFromEnv()
    const runtime = new McpRuntime(config)
    runtime.getLogger().info('starting mcp server', {
        sessionId: config.sessionId,
        authPath: config.authPath,
        transport: config.transport
    })

    const sdk = await loadSdk()
    const { shutdown: shutdownTransport } =
        config.transport === 'http'
            ? await runHttpTransport(sdk, runtime, options, config)
            : await runStdioTransport(sdk, runtime, options)

    const shutdown = async (signal: string): Promise<void> => {
        runtime.getLogger().info('shutting down', { signal })
        try {
            await runtime.destroyClient()
        } catch {
            /* swallow */
        }
        try {
            await shutdownTransport()
        } catch {
            /* swallow */
        }
        try {
            await runtime.closeLogFile()
        } catch {
            /* swallow */
        }
        process.exit(0)
    }
    process.on('SIGINT', () => void shutdown('SIGINT'))
    process.on('SIGTERM', () => void shutdown('SIGTERM'))
}
