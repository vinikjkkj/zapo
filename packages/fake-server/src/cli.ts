#!/usr/bin/env node
/** Standalone CLI for `@zapo-js/fake-server`. */

import { FakeWaServer } from './api/FakeWaServer'

interface CliArgs {
    readonly host: string
    readonly port: number
    readonly path: string
    readonly peerJids: readonly string[]
    readonly groupSpecs: readonly string[]
    readonly log: boolean
    readonly quiet: boolean
    readonly json: boolean
    readonly help: boolean
}

function parseArgs(argv: readonly string[]): CliArgs {
    let host = '127.0.0.1'
    let port = 0
    let path = '/ws/chat'
    const peerJids: string[] = []
    const groupSpecs: string[] = []
    let log = false
    let quiet = false
    let json = false
    let help = false

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        const next = (): string => {
            const value = argv[index + 1]
            if (value === undefined) {
                throw new Error(`missing value for ${arg}`)
            }
            index += 1
            return value
        }
        switch (arg) {
            case '-h':
            case '--help':
                help = true
                break
            case '--host':
                host = next()
                break
            case '--port':
                port = Number.parseInt(next(), 10)
                if (!Number.isFinite(port) || port < 0 || port > 65535) {
                    throw new Error(`invalid --port: ${argv[index]}`)
                }
                break
            case '--path':
                path = next()
                break
            case '--peer':
                peerJids.push(next())
                break
            case '--group':
                groupSpecs.push(next())
                break
            case '--log':
                log = true
                break
            case '--quiet':
                quiet = true
                break
            case '--json':
                json = true
                break
            default:
                throw new Error(`unknown flag: ${arg}`)
        }
    }
    return { host, port, path, peerJids, groupSpecs, log, quiet, json, help }
}

function printHelp(): void {
    process.stdout.write(`@zapo-js/fake-server — standalone fake WhatsApp Web server

USAGE
  npx @zapo-js/fake-server [flags]

FLAGS
  --host <host>       Bind host (default: 127.0.0.1)
  --port <port>       WebSocket listener port (default: random)
  --path <path>       WebSocket upgrade path (default: /ws/chat)
  --peer <jid>        Pre-create a fake peer; can be repeated
  --group <spec>      Pre-create a fake group; spec format
                      <group-jid>=<peer-jid>,<peer-jid>,...
                      All peers must already be passed via --peer.
  --log               Print every captured inbound stanza
  --quiet             Suppress the startup info banner
  --json              Print connection info as JSON
  -h | --help         Show this help

The server stays up until SIGINT (Ctrl+C).
`)
}

interface ParsedGroupSpec {
    readonly groupJid: string
    readonly participantJids: readonly string[]
}

function parseGroupSpec(spec: string): ParsedGroupSpec {
    const eqIdx = spec.indexOf('=')
    if (eqIdx < 0) {
        throw new Error(
            `invalid --group spec '${spec}': expected '<group-jid>=<peer-jid>,<peer-jid>,...'`
        )
    }
    const groupJid = spec.slice(0, eqIdx).trim()
    const participantsRaw = spec.slice(eqIdx + 1)
    const participantJids = participantsRaw
        .split(',')
        .map((jid) => jid.trim())
        .filter((jid) => jid.length > 0)
    if (!groupJid || participantJids.length === 0) {
        throw new Error(`invalid --group spec '${spec}': empty group jid or participant list`)
    }
    return { groupJid, participantJids }
}

async function main(): Promise<void> {
    let args: CliArgs
    try {
        args = parseArgs(process.argv.slice(2))
    } catch (error) {
        process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
        process.stderr.write('run with --help to see usage.\n')
        process.exit(2)
    }

    if (args.help) {
        printHelp()
        process.exit(0)
    }

    const parsedGroups = args.groupSpecs.map(parseGroupSpec)
    for (const group of parsedGroups) {
        for (const jid of group.participantJids) {
            if (!args.peerJids.includes(jid)) {
                process.stderr.write(
                    `error: --group '${group.groupJid}' references peer '${jid}' that was not declared via --peer\n`
                )
                process.exit(2)
            }
        }
    }

    const server = await FakeWaServer.start({
        host: args.host,
        port: args.port,
        path: args.path
    })

    let setupComplete = false
    const setupPromise = new Promise<void>((resolve, reject) => {
        server.onAuthenticatedPipeline(async (pipeline) => {
            if (setupComplete) return
            setupComplete = true
            try {
                const peers = new Map<
                    string,
                    Awaited<ReturnType<typeof server.createFakePeer>>
                >()
                for (const jid of args.peerJids) {
                    const peer = await server.createFakePeer({ jid }, pipeline)
                    peers.set(jid, peer)
                    process.stdout.write(`[fake-server] created peer ${jid}\n`)
                }
                for (const group of parsedGroups) {
                    const participants = group.participantJids.map((jid) => {
                        const peer = peers.get(jid)
                        if (!peer) {
                            throw new Error(
                                `internal: peer ${jid} not found for group ${group.groupJid}`
                            )
                        }
                        return peer
                    })
                    server.createFakeGroup({
                        groupJid: group.groupJid,
                        participants
                    })
                    process.stdout.write(
                        `[fake-server] created group ${group.groupJid} with ${participants.length} participants\n`
                    )
                }
                resolve()
            } catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)))
            }
        })
    })
    setupPromise.catch((error) => {
        process.stderr.write(`error: ${error.message}\n`)
        process.exitCode = 1
    })

    if (args.log) {
        server.onPipeline((pipeline) => {
            pipeline.setEvents({
                onStanza: (node) => {
                    process.stdout.write(
                        `[wire] ${node.tag}${node.attrs.id ? ` id=${node.attrs.id}` : ''}${node.attrs.type ? ` type=${node.attrs.type}` : ''}\n`
                    )
                }
            })
        })
    }

    if (!args.quiet) {
        const noiseRoot = server.noiseRootCa
        if (args.json) {
            process.stdout.write(
                JSON.stringify(
                    {
                        url: server.url,
                        host: server.host,
                        port: server.port,
                        path: args.path,
                        noiseRootCa: {
                            serial: noiseRoot.serial,
                            publicKeyHex: bytesToHex(noiseRoot.publicKey)
                        },
                        peers: args.peerJids,
                        groups: parsedGroups
                    },
                    null,
                    2
                ) + '\n'
            )
        } else {
            const banner = [
                '',
                '┌─────────────────────────────────────────────────────────────',
                '│ @zapo-js/fake-server is up',
                '├─────────────────────────────────────────────────────────────',
                `│ url            ${server.url}`,
                `│ host           ${server.host}`,
                `│ port           ${server.port}`,
                `│ path           ${args.path}`,
                `│ noise root ca  serial=${noiseRoot.serial} pub=${bytesToHex(noiseRoot.publicKey).slice(0, 32)}…`,
                `│ peers          ${args.peerJids.length === 0 ? '(none)' : args.peerJids.join(', ')}`,
                `│ groups         ${parsedGroups.length === 0 ? '(none)' : parsedGroups.map((g) => g.groupJid).join(', ')}`,
                '├─────────────────────────────────────────────────────────────',
                '│ Wire your WaClient with:',
                '│   chatSocketUrls: [server.url]',
                '│   testHooks: { noiseRootCa: <hex above as Uint8Array> }',
                '│ Hit Ctrl+C to stop.',
                '└─────────────────────────────────────────────────────────────',
                ''
            ]
            process.stdout.write(banner.join('\n'))
        }
    }

    let stopping = false
    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
        if (stopping) return
        stopping = true
        process.stdout.write(`\n[fake-server] received ${signal}, shutting down…\n`)
        try {
            await server.stop()
            process.stdout.write('[fake-server] stopped cleanly\n')
            process.exit(0)
        } catch (error) {
            process.stderr.write(
                `error during shutdown: ${error instanceof Error ? error.message : String(error)}\n`
            )
            process.exit(1)
        }
    }
    process.on('SIGINT', () => void shutdown('SIGINT'))
    process.on('SIGTERM', () => void shutdown('SIGTERM'))

    await new Promise<void>(() => undefined)
}

function bytesToHex(bytes: Uint8Array): string {
    let out = ''
    for (let index = 0; index < bytes.byteLength; index += 1) {
        const value = bytes[index]
        out += value < 16 ? `0${value.toString(16)}` : value.toString(16)
    }
    return out
}

main().catch((error) => {
    process.stderr.write(`fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exit(1)
})
