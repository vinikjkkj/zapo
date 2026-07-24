#!/usr/bin/env node
/** Standalone CLI for `@zapo-js/fake-server`. */

import { createInterface } from 'node:readline'

import { FakeWaServer } from './api/FakeWaServer'
import { parsePairingQrString } from './protocol/auth/pair-device'
import { bytesToHex, toError } from './transport/util'

interface CliArgs {
    readonly host: string
    readonly port: number
    readonly path: string
    readonly peerJids: readonly string[]
    readonly groupSpecs: readonly string[]
    readonly pairJid: string | null
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
    let pairJid: string | null = null
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
            case '--pair':
                pairJid = next()
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
    return { host, port, path, peerJids, groupSpecs, pairJid, log, quiet, json, help }
}

function printHelp(): void {
    process.stdout.write(`@zapo-js/fake-server – standalone fake WhatsApp Web server

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
  --pair <jid>        Drive QR pairing for unregistered clients: the server
                      sends pair-device refs, then prompts on stdin for the
                      QR payload the client displays
                      (ref,noisePubB64,identityPubB64,advSecretB64,platform)
                      and answers pair-success assigning <jid> as the device
                      jid. Without this flag the CLI is login-only.
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
        process.stderr.write(`error: ${toError(error).message}\n`)
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

    if (args.pairJid !== null) {
        const pairJid = args.pairJid
        let pairingStarted = false
        server.onAuthenticatedPipeline(async (pipeline) => {
            if (pairingStarted) return
            if (pipeline.clientPayload?.kind !== 'registration') return
            pairingStarted = true
            try {
                await server.runPairing(pipeline, { deviceJid: pairJid }, async () => {
                    const qr = await readStdinLine(
                        '[fake-server] paste the QR payload displayed by the client and press Enter:\n'
                    )
                    const parsed = parsePairingQrString(qr.trim())
                    return {
                        advSecretKey: parsed.advSecretKey,
                        identityPublicKey: parsed.identityPublicKey
                    }
                })
                process.stdout.write(
                    `[fake-server] pair-success sent for ${pairJid}; the client will now reconnect and log in\n`
                )
            } catch (error) {
                pairingStarted = false
                process.stderr.write(`pairing failed: ${toError(error).message}\n`)
            }
        })
    }

    let setupComplete = false
    const setupPromise = new Promise<void>((resolve, reject) => {
        server.onAuthenticatedPipeline(async (pipeline) => {
            if (setupComplete) return
            if (pipeline.clientPayload?.kind !== 'login') return
            setupComplete = true
            try {
                const peers = new Map<string, Awaited<ReturnType<typeof server.createFakePeer>>>()
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
                reject(toError(error))
            }
        })
    })
    setupPromise.catch((error) => {
        process.stderr.write(`error: ${error.message}\n`)
        process.exitCode = 1
    })

    if (args.log) {
        // onCapturedStanza taps the server's own capture stream; overriding
        // pipeline.setEvents here would replace the server's handlers and
        // silently break --peer setup and stanza capture.
        server.onCapturedStanza((node) => {
            process.stdout.write(
                `[wire] ${node.tag}${node.attrs.id ? ` id=${node.attrs.id}` : ''}${node.attrs.type ? ` type=${node.attrs.type}` : ''}\n`
            )
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
                        groups: parsedGroups,
                        pair: args.pairJid
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
                `│ pair mode      ${args.pairJid ?? '(off – login only)'}`,
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
            process.stderr.write(`error during shutdown: ${toError(error).message}\n`)
            process.exit(1)
        }
    }
    process.on('SIGINT', () => void shutdown('SIGINT'))
    process.on('SIGTERM', () => void shutdown('SIGTERM'))

    await new Promise<void>(() => undefined)
}

function readStdinLine(prompt: string): Promise<string> {
    process.stdout.write(prompt)
    return new Promise((resolve, reject) => {
        const rl = createInterface({ input: process.stdin })
        // resolve before close(): rl.close() emits 'close' synchronously,
        // which would otherwise reject the still-pending promise first.
        rl.once('line', (line) => {
            resolve(line)
            rl.close()
        })
        rl.once('close', () => reject(new Error('stdin closed before a QR payload was provided')))
    })
}

main().catch((error) => {
    const normalized = toError(error)
    process.stderr.write(`fatal: ${normalized.stack ?? normalized.message}\n`)
    process.exit(1)
})
