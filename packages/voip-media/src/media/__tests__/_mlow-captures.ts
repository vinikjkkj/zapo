/** One audio RTP packet an official client sent. */
export interface CapturedMlowPacket {
    readonly sequenceNumber: number
    readonly timestamp: number
    readonly payload: Uint8Array
}

function fromHex(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2)
    for (let index = 0; index < bytes.length; index++) {
        bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
    }
    return bytes
}

type HexPacket = { sequenceNumber: number; timestamp: number; payload: string }

function fromHexPackets(packets: readonly HexPacket[]): CapturedMlowPacket[] {
    return packets.map((packet) => ({
        sequenceNumber: packet.sequenceNumber,
        timestamp: packet.timestamp,
        payload: fromHex(packet.payload)
    }))
}

/**
 * Eight consecutive PT 120 packets WhatsApp Web sent (SSRC `99ae532b`). Each payload ends where
 * the decoder stops reading: dropping its last byte changes the PCM.
 */
const PACKETS: readonly HexPacket[] = [
    {
        sequenceNumber: 124,
        timestamp: 236_160,
        payload:
            '92027550d981bb22f81dfa91ebda236a7680e7593a65b2673459ecd35b20dca93cfdb617d093be24' +
            '9b868cf3f0637eb6a176a0ed16030526dbb4585016727dedb9804e1fc0ef87827c0e661aaad10842' +
            '4ce5971714c03d98a896add952b13cf1bfc40558964b212c2983cba6132af41f090898ce33647c40' +
            '50e4f89118dc746f3cc86458ba1505bc61e49d950f4e44e38613225e274ad4cfc12746d3e4cb1c33' +
            'b627c3e02f92bd28cdd6d9fb87d94792147fa1e6322f84c4fb84f5d0aeaf90e2777712781c00840f' +
            'f802fb2da4769cfafbbe53df6c31455f571753715320'
    },
    {
        sequenceNumber: 125,
        timestamp: 238_080,
        payload:
            '92026e50a337397b8eca135e490efef24405ddd93ca1157f1dccb6ca6e654debe6c209919f61e6ac' +
            '25bff884daaae79ce88f40f202fd6c720763997294bc3496f265f98f64bda18885b462525ab27f4b' +
            'aed35b440cce1a9faf86dd906829642fbbc69de162ec5da64a53cadf93bd3b314350d981bb22f84f' +
            '356f25297ba29aa80b0a9721ba3609ebe2483b810e35e905ca6f278ae85ccf54945bfefd85ab398a' +
            '2b82c504800a4f64aed3105d003321ce843ae96bcca0dbf61c74ec5c257cbc3d84829198bae38e4a' +
            'd9fbaf66b51c2c8db4b158c69005fbc5f73a5d2f20'
    },
    {
        sequenceNumber: 126,
        timestamp: 240_000,
        payload:
            '92028950d802dd57e084f1805f4a0185023c0da1dc1869442907ff5dfd4c5c849bcccd7eb0db1443' +
            'e9f007b0e7e7368bb38978b7094b1b15e0f265cb4e213646963ea1c603249a8ed230f28685703d0f' +
            'f73a9e850e5e7e5bb826ead6027590546a6d4eafd131f5ba96cec70b999ba2a66f3a0a898dd4a74c' +
            '7814c2b5ba4b111ef5c42c29b33475883ed4d71050d4e8faab2a7396296ec0ee33371829c0308ef1' +
            '67907004b7a7f6c028e439ee9392ac92e1ecde50e9511dacd173f9b4aedc53d42ac843968a7afce6' +
            'd0f6426b511642f9ab2497a3018e6fd29739e6a8b3fdb233e4b9e9f04409e8c9f03ca13d6975aa95' +
            'af07f89f4b5a2f20'
    },
    {
        sequenceNumber: 127,
        timestamp: 241_920,
        payload:
            '92026d50daa1bf0ad000f9d942ad5b65052a4a05dcc6237defe620d911d21aa213652430bb3a9403' +
            'eeb727a8f11f5d66c605557f8883a8ee900ed313ff1b479e253c2d08c8a23b44d69d6f29770d5d6c' +
            '31d409f008a6a6e17d7b88758033de416094297729363a19fac5803278b68fc850dc61cb8b8e603f' +
            '8c06c656c4acc09c4c00815d7213101cd51addbd6dc701fdea443ffee410647fc53c357ffbe0e315' +
            'ff521f75809c7c49609baf358363247f3d07e14a564d66883b4b60be25d9253cd67e9e7c3e870d54' +
            '7585b3da5229cef2057f7ca9ea3a1ebccf187041b209756be37fbbe0'
    },
    {
        sequenceNumber: 128,
        timestamp: 243_840,
        payload:
            '92026d50d81f2531e60f9a481865d69b8f15649eb52ac03078763be599978822353de569af33e269' +
            '1ba88ad4a8c480477f6e9d0c5ddf7131c5bde807650d569edb6d59c3978d95cb7e45b71cf509dd7c' +
            '0d5f42ea254dc1c6656a5d0210c1ade3bae1a4c56b574370bc6467fc0498bb7050d9873ae8ecd411' +
            '680dd871267946a018783bda5d52239a0003dcae3b5cf2744e02318932ea449dec6ce5b6f035009e' +
            '4e78b6659266872b6100d63043824ba0e862882f2733fc5029f988f0b7d75c59df0f36bef8663b9c' +
            '842f157b60c22b06d66e292995765490d15388009d12d0db1c'
    },
    {
        sequenceNumber: 129,
        timestamp: 245_760,
        payload:
            '92026c50d981bb22f81dfa1bea6e1fa593906ff576dd47bd7f6c834997275bf6868d0ffd5ef8af81' +
            '6242280929690d1e1c8a0ae6eff47972581355c3ad1300985f937b90ea2da5332ccb687ad3b81999' +
            '21c653c24778a9becd83a0b2a7f3639784dc20609f8e02d6afdae366ab8dbe508d2cafcf4e23059c' +
            '21305b08ef666865f3896daf9e947da71d7b3c0d8f9b1af8b3fa9624eb13ba41ced32ad140a5364b' +
            'a81e157e1e236d6edf11615169c700c925800e70e574b05f500fa9f3729b55096850b3adedc6f4a4' +
            '46800406f6c51a71c06d2432'
    },
    {
        sequenceNumber: 130,
        timestamp: 247_680,
        payload:
            '92026450e4f3a7c88e7db71ee247c56035fd4a6ea2f8eecc8a23df9ff3fd6c5968867dc16ab9d299' +
            'd0415559cb16cb7299d6bc5ebc9858363f66b90ee432a1fe50b456180ead4b62dce2415b2165ee21' +
            'bd91476283714e960804987d406324797c6d287b852d3450d981bb22f84f358a7305a5d718478d7f' +
            'dcf15e6b6ea4c3ae807f7581757800d4078ce4b196c1f73734e252d215318aed7488f04468dc347b' +
            '1773cb6f67520ca596986ac5755d7832ca535ed72e0a4c2c7a6e37a037ab41af8b5c23076380075e' +
            'b0b9bd1e457133193507b24556583bb54f8af069b7dabd9c742f28b60f'
    },
    {
        sequenceNumber: 131,
        timestamp: 249_600,
        payload:
            '92027250d802dd57b0b15d9c74384450d36ef7a6048930e0afb7bbe79080c270799d7ca3c9656a6f' +
            '039d08704dc8490f3b5bd5a2b71ed9af96360aff2fba2441f67621f07f2cdc1bc6d508dfc35d78b9' +
            '3a5506b1cd43f9e17cabb0461cb2492493db35a9272bc4796acb5184e8df7776be9d7ecdd050d822' +
            '295260bc4ff0edb12fa7dcfc5d3fdd4856fbba8be9ae08964addff6d54c1d373a5157cab3c8461b6' +
            'bf76358f6288f11b659ceeb85187da84c7c20ddcb23d92196d3383c9751f8c0f6b3138397548a38a' +
            'bec5c2ee5037344ab94162e9a036ce01176e396a7beefc98c605338b955c80'
    }
]

export const OFFICIAL_MLOW_PACKETS: readonly CapturedMlowPacket[] = fromHexPackets(PACKETS)

/** One PT 121 stream: the SSRC it came on and its packets in arrival order. */
export interface CapturedMlowStream {
    readonly ssrc: number
    readonly packets: readonly CapturedMlowPacket[]
}

/**
 * WhatsApp Android with `enable_mlow_separate_pt_tx` on: every audio packet on PT 121, one plain
 * 60 ms frame each, speech (`0x50`), `0x90`, in-band FEC (`0x12`) and a 10 ms `00`, with DTX gaps.
 */
export const ANDROID_PT121_STREAM: CapturedMlowStream = {
    ssrc: 0xd9ac9b18,
    packets: fromHexPackets([
        { sequenceNumber: 54, timestamp: 290_880, payload: '904ab1a577e7f0' },
        {
            sequenceNumber: 55,
            timestamp: 293_760,
            payload: '50350e57c0c7664e7818312c8714fc5f9acbbc7b3eca2e931f6d80ba6b'
        },
        {
            sequenceNumber: 56,
            timestamp: 294_720,
            payload: '50224093b8de73991748bd3ceb05917e58b348065a46332a1d050a29d120'
        },
        { sequenceNumber: 57, timestamp: 295_680, payload: '1237a70fac482f532867ec32183819d13675' },
        { sequenceNumber: 58, timestamp: 300_480, payload: '90bd3660f230' },
        { sequenceNumber: 59, timestamp: 301_440, payload: '00' },
        { sequenceNumber: 60, timestamp: 307_200, payload: '90b9058a89' },
        { sequenceNumber: 61, timestamp: 313_920, payload: '9036ba6ffa40' },
        { sequenceNumber: 62, timestamp: 324_480, payload: '90b7924da9c0' },
        {
            sequenceNumber: 63,
            timestamp: 330_240,
            payload:
                '503605a7ac844093c9a23a8388b5260e87dc9d38a443930d9580d65ae1221055fd0eff800401ba78' +
                'eade'
        },
        {
            sequenceNumber: 64,
            timestamp: 331_200,
            payload:
                '50ddae6de6a567485de64fb1b845c0e99327021dce9bfba3f7a01cf1ca4eb7ce9ab8ea78c20c14e1' +
                '204777423bf6eee10d924598ff9db50815b492487083b35cee93a7fbca817cbbc41808792f8e841c' +
                '7d0583a7e46673ee26437772590d2d6a6a93f104e7'
        },
        {
            sequenceNumber: 65,
            timestamp: 332_160,
            payload:
                '5018805795c29ff307406d65ceaf5d6b37cc1de793a058204a283e605a892f28a2ccd42ae7f8881d' +
                'a381d0eb86979a94433fe91c16dcb171d5fd88333ed993a435d19c33a4a07926b63cc693089da251' +
                '0f96d174f0b2b3524045d4603370659080'
        },
        {
            sequenceNumber: 66,
            timestamp: 333_120,
            payload:
                '5051e77c4f93329c344fbd5fb5964494bddd7442a35aa64c7dc958dc5490f4362c88a29cb2f10d47' +
                'f7d436c46af67f60fbb92e0adbe433dc013d7425b7c1f27195fe0a976ee9350f953f00b066a568a3' +
                'c9326c1617bae276e77898'
        }
    ])
}

/** WhatsApp Web with the same flags: continuous speech on PT 121, one `0x50` frame per 960. */
export const WEB_PT121_STREAM: CapturedMlowStream = {
    ssrc: 0x598a8286,
    packets: fromHexPackets([
        {
            sequenceNumber: 67,
            timestamp: 183_360,
            payload:
                '50e4f3e0ac6553e5c8090679e50742f2bd0b23e2fcd47dda0fc7c856f62ee3e351e3900feff5eaad' +
                'acef3982167e90a3e163249bd82c72961f96ef8d9c'
        },
        {
            sequenceNumber: 68,
            timestamp: 184_320,
            payload:
                '50e4f5461f64e10a7d2b46d6789729e681a6a3a42278b801c334d64b0d7f8e3660ffec607d7a9c6a' +
                '9520566d71eea62beeffd598fb041866d3b96db6'
        },
        {
            sequenceNumber: 69,
            timestamp: 185_280,
            payload:
                '50a336892d967f3206462ed2ede7e3889d9456cea9427c0db27400309f672604228b9120339e5db1' +
                '29df06aa4b615294e60083d72fa0324af7fd7999b8f6406566'
        },
        {
            sequenceNumber: 70,
            timestamp: 186_240,
            payload:
                '50e4f5461e93b5fb2fcb6cb3f47882c54316f88c9acd11f8884f7ddeddf9905a00f6472320a0bb6d' +
                'c2a4c8d07e923c26af6fad816c12fc8fe1b3'
        },
        {
            sequenceNumber: 71,
            timestamp: 187_200,
            payload:
                '50e4f3e0ac655eb1ce94da218be8f66b743bccaa22ee1a59447decc4b339b925853d4686e6f50847' +
                '6564441625344c538ed3dd2c8a2af6326cca1d097114'
        },
        {
            sequenceNumber: 72,
            timestamp: 188_160,
            payload:
                '50e4f3e0adb7fbb7056df71ecc773b0f3c629ee950754f296cd94f81335536b8614c12aebdcf8407' +
                '9aaa5c7ce4c87ae8bb4343ce3ecc704efd2b6110a8d0'
        },
        {
            sequenceNumber: 73,
            timestamp: 189_120,
            payload:
                '50e4f3e0adba9d5db3aa2aa95c4efabe77a89724143a1c3c03138381b714d281c97139ba18a311d6' +
                '46da32cb6f842faffe165955557797c76fa4b21eb48114'
        },
        {
            sequenceNumber: 74,
            timestamp: 190_080,
            payload:
                '50d87bd99793ff28cc75236fb559d9ae3fcc461af9471fd0d6db44c1205a6ccf78a8d28b179e5e13' +
                '2b3f3dc60f3a79284282e739ec9ca295831f14f2918f82'
        },
        {
            sequenceNumber: 75,
            timestamp: 191_040,
            payload:
                '50e4f397ace7cd9a43977d9905b74da8db1cd8cfd1eb3fd832b46666bc4aa8745e9a240a1e2ce2b2' +
                'a64502f96b0bd641cd5d57bc1cb73e1bdbcae0'
        },
        {
            sequenceNumber: 76,
            timestamp: 192_000,
            payload:
                '50a342921651af32dbd454037f0c4e1ee56f8ac2409576f2a34215b1bea7b02ca31c3f97bac88364' +
                '914e244d46e2c47a314d926d89c3ea4bf45132b146d0ff45946ff77c'
        }
    ])
}
