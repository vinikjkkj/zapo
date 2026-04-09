/**
 * HTTPS listener for fake media uploads + downloads.
 *
 * The lib's `WaMediaTransferClient` hardcodes `https://` for media
 * upload + relative-path download URLs (see `buildUploadUrl` in
 * `src/client/messages.ts` and `resolveUrls` in
 * `src/media/WaMediaTransferClient.ts`). To intercept those flows
 * end-to-end the fake server has to speak TLS.
 *
 * The cert/key below is a throwaway 100-year self-signed RSA pair
 * generated locally with `openssl req -x509 -newkey rsa:2048 ...`.
 * It is committed to the repo because it has zero security value
 * (only signs the literal hostname `fake-media.local`, never trusted
 * by any production CA, only loaded by test fixtures). Tests opt the
 * lib into trusting the cert by injecting a custom `https.Agent`
 * with `rejectUnauthorized: false` via
 * `proxy: { mediaUpload, mediaDownload }`.
 *
 * This file is server scaffolding, not a `/deobfuscated` mirror.
 */

import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import type { AddressInfo } from 'node:net'

import type { WaFakeHttpRequestHandler } from './WaFakeWsServer'

const FAKE_MEDIA_TLS_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC3xTRqB/wZbz/w
pQgcOfCfizS0MrtVR0ulBa1vK4OlU1FXJNC0dtTKLs/jMWNqwYWXxSoGEHHfhUIS
PgZ08nauCJs83ZFAQC1Es1sN1R32YokPmKOCTHHh8f5/uX3h5oUD/xr3gwOVs4c2
ISmk1OTmp77KolxZXHOnlnHweO6DK0CqfT+53RzKj5rz4d7inyMk5ctk+JjHZd8e
q46e4MH4ZWPM+ehwRwgWMQ2E1bFjVQsBMvtAkUxOEx+B2/Cys6jEUFo/ABkQxXt+
InqWnYKHbPOToKmpPxDjT54OpVZs4IRtbkTrgEMMz3/c5g4XamGUHLqkI0GBESK2
16STZettAgMBAAECggEAAr6CDGOfMMzRkdyeWyKosPKMIGbY+wNiSSbsabim4BO3
LkLQgSK1d3fF3+KrDj6/DUJUti2/oZEKGoKwUn6T14BmV+7qvjX1WN8kqNsGYLXP
XFB0jinpkf6XhPKUn7olCGdwglgR28XknLBXsmG6eMK5ODgiZi0Zqng9WPCSP3Aa
5q7iSeJF0FsbQ1OdQT3t98WhnSN9t0TzLyNUqXWDBDIrrtT3O7B7theS+3LRhodE
VFROogp4hfo6pBNweki08uFD250OP6iGpYsE0xY6NIfyebGS2iBmbDKQmMkWLdf0
mSlvYoksnDan4tJMiXAbb39wLdJEa+x98Qzxq0iJyQKBgQDeBQSgVd7j99W0bdzo
fnDgnjJS606UrWID/RyTEIMfq5Jf2sM2vTJ2/w4X1JoUxxQCJbFmoJs9RXn52XUa
3/GaUbr3akUVjMb93JlbWTQVoKipMM6HGCee4rj69qdsmA8iJrnloGFpymLThcfm
xZB535vbG3DrYRM8MH/crDQH2QKBgQDT5YlXskOxx/iVxpko4uacIBqHnPGbCPnK
LXMaa5vrjGgWNK0ajj+0MFdpEl+HXC7ZDISmSRKExrMDaWkjoXzXhxz1BmHVdN3O
lOZY6gY+WeQUPn2sfqROBAV7B66LmRjbLdK9kwqrD3nhED6XWR+ZuXaH0dMQ2UMe
T9E1ixr3tQKBgQChrYvR6taWsosYioy9bh5rJCjHg33E/YIMH41odzTVok7EqP1R
5nNSfqhXqEXQbazfZ22Jq9mAxBBwZvBFcuFxHKWHuQa4C715buTqxcoNGeLY2qb7
cBaiOL62W1pO1Wjn2MW1N5bYwD45hQmuvx5X8gOAirovXpDwWu0x2OFG+QKBgAxE
U4kiJs0Z+IgjMSauzA7pxN9o9Iu3H07XBrzW0fX28OeoMQVCiumRit3oVGNvsL6b
/OnrfQj2v9JIve90H9gSWFjO/8bttxGIiTVIhwgBCDUr0Pa1dimWDgMrVK18NXYq
1vJmms2AXdvrptP4Mt4hYH1IZmGpUjtk/4WMAgmpAoGAKJXzDPY5ll9Ebjz28u3W
sPZdIz90rpRIBnyDC/AwtEzliU2PkuGpqe1ZJaP6cmPTxf/Bv8hfUMXknURpOShE
Uusyt3/4dGRMY+XXKuTPMZA8sbIEatA2z2e6oBoyj9avzEKAwDsReuPyyX6BubTx
rLSyj/PpCngrQw7YXsQc6Wc=
-----END PRIVATE KEY-----
`

const FAKE_MEDIA_TLS_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDGTCCAgGgAwIBAgIUCb8Qbq/uzK9W14G057lmny5p4kIwDQYJKoZIhvcNAQEL
BQAwGzEZMBcGA1UEAwwQZmFrZS1tZWRpYS5sb2NhbDAgFw0yNjA0MDgyMjAzMDRa
GA8yMTI2MDMxNTIyMDMwNFowGzEZMBcGA1UEAwwQZmFrZS1tZWRpYS5sb2NhbDCC
ASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALfFNGoH/BlvP/ClCBw58J+L
NLQyu1VHS6UFrW8rg6VTUVck0LR21Mouz+MxY2rBhZfFKgYQcd+FQhI+BnTydq4I
mzzdkUBALUSzWw3VHfZiiQ+Yo4JMceHx/n+5feHmhQP/GveDA5WzhzYhKaTU5Oan
vsqiXFlcc6eWcfB47oMrQKp9P7ndHMqPmvPh3uKfIyTly2T4mMdl3x6rjp7gwfhl
Y8z56HBHCBYxDYTVsWNVCwEy+0CRTE4TH4Hb8LKzqMRQWj8AGRDFe34iepadgods
85Ogqak/EONPng6lVmzghG1uROuAQwzPf9zmDhdqYZQcuqQjQYERIrbXpJNl620C
AwEAAaNTMFEwHQYDVR0OBBYEFG3DX82mLaatjTwwspHIj2pOD8CnMB8GA1UdIwQY
MBaAFG3DX82mLaatjTwwspHIj2pOD8CnMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZI
hvcNAQELBQADggEBAEqIu6mXgvSrGyQxRp6cJVg5OhBpwxH/V0IFe2H7xPBxreDS
e9yb/ESLRFxpfeWhLXOBEsOGbrF8HvZ0zNTHW+MtIkJB/hhYVzDJyhEpf9jWvpaM
H6CyzWIZgrXMmyeh0WkmVWoYyvlQrz9yJP63VfzCTCO6YBo02S+kKAyJiM9l8ZW5
8vALhsyrGSMDnxQSixdc4L/Migam1LHxqwApzDvTdfXNiqjWEmfbw7sQKjd8EHad
KxNzgzzCRBSkeLe9YoXxLkKRvYeBM/xiv0AVp/ABedHj0xj3ybvvdjowui1uCBip
BoMF3OiuOeaTubj+tDzpZcauS4L+OyUPjsKqFoM=
-----END CERTIFICATE-----
`

export interface WaFakeMediaHttpsServerListenInfo {
    readonly host: string
    readonly port: number
}

export class WaFakeMediaHttpsServer {
    private server: HttpsServer | null = null
    private listenInfo: WaFakeMediaHttpsServerListenInfo | null = null
    private requestHandler: WaFakeHttpRequestHandler | null = null

    public setRequestHandler(handler: WaFakeHttpRequestHandler | null): void {
        this.requestHandler = handler
    }

    public async listen(host = '127.0.0.1', port = 0): Promise<WaFakeMediaHttpsServerListenInfo> {
        if (this.server) {
            throw new Error('fake media https server is already listening')
        }
        const server = createHttpsServer(
            {
                key: FAKE_MEDIA_TLS_KEY_PEM,
                cert: FAKE_MEDIA_TLS_CERT_PEM
            },
            (req, res) => {
                const handler = this.requestHandler
                if (!handler) {
                    res.statusCode = 404
                    res.end()
                    return
                }
                try {
                    const result = handler(req, res)
                    if (result instanceof Promise) {
                        result.catch((error) => {
                            if (!res.headersSent) {
                                res.statusCode = 500
                            }
                            res.end(error instanceof Error ? error.message : String(error))
                        })
                    }
                } catch (error) {
                    if (!res.headersSent) {
                        res.statusCode = 500
                    }
                    res.end(error instanceof Error ? error.message : String(error))
                }
            }
        )
        await new Promise<void>((resolve, reject) => {
            const onError = (error: Error): void => {
                server.off('listening', onListening)
                reject(error)
            }
            const onListening = (): void => {
                server.off('error', onError)
                resolve()
            }
            server.once('error', onError)
            server.once('listening', onListening)
            server.listen(port, host)
        })
        const address = server.address() as AddressInfo
        this.server = server
        this.listenInfo = { host: address.address, port: address.port }
        return this.listenInfo
    }

    public async close(): Promise<void> {
        const server = this.server
        if (!server) return
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()))
        })
        // Force any keep-alive sockets to close so the test process can exit.
        server.closeAllConnections?.()
        this.server = null
        this.listenInfo = null
    }

    public get info(): WaFakeMediaHttpsServerListenInfo | null {
        return this.listenInfo
    }
}
