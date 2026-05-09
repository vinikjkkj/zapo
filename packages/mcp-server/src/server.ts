import {
    createServer as createHttpServer,
    type IncomingMessage,
    type Server as NodeHttpServer,
    type ServerResponse
} from 'node:http'

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

export interface RunMcpServerOptions {
    readonly name?: string
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
            const err = error as Error
            runtime.getLogger().warn('tool handler failed', {
                tool: tool.name,
                message: err?.message ?? String(error)
            })
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            encodeForJson({
                                error: {
                                    name: err?.name ?? 'Error',
                                    message: err?.message ?? String(error),
                                    stack: err?.stack
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
        const MAX_BODY = 8 * 1024 * 1024
        req.on('data', (chunk: Buffer) => {
            total += chunk.length
            if (total > MAX_BODY) {
                req.destroy(new Error('request body too large'))
                return
            }
            chunks.push(chunk)
        })
        req.on('end', () => {
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
        req.on('error', reject)
    })
}

const runHttpTransport = async (
    sdk: SdkBundle,
    runtime: McpRuntime,
    options: RunMcpServerOptions,
    config: Pick<RuntimeConfig, 'httpHost' | 'httpPort' | 'httpPath'>
): Promise<{ shutdown: () => Promise<void>; httpServer: NodeHttpServer }> => {
    const route = config.httpPath
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
                JSON.stringify({ error: 'invalid json body', message: (error as Error).message })
            )
            return
        }

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
            runtime.getLogger().warn('http request failed', {
                message: (error as Error)?.message ?? String(error)
            })
            if (!res.headersSent) {
                res.writeHead(500, { 'content-type': 'application/json' }).end(
                    JSON.stringify({ error: 'internal', message: (error as Error)?.message })
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
