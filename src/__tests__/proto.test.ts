import assert from 'node:assert/strict'
import test from 'node:test'

import { proto } from '@proto'
import { bytesToHex, hexToBytes } from '@util/bytes'

function assertWire(actual: Uint8Array, expected: Uint8Array): void {
    assert.equal(bytesToHex(actual), bytesToHex(expected))
}

// Literal fixtures pin field numbers and wire types independently of encode().
// Current fields follow Web 2.3000.1050588369; legacy and unknown fields have separate cases.
test('protobuf encodes music with the published field numbers', () => {
    const message = {
        musicMessage: { songUri: 'song', artworkUri: 'art', style: 1 }
    }
    const wire = hexToBytes('8a080d1204736f6e671a036172742001')

    assertWire(proto.Message.encode(message).finish(), wire)
    const decoded = proto.Message.decode(wire)
    assert.equal(decoded.musicMessage?.songUri, 'song')
    assert.equal(decoded.musicMessage?.artworkUri, 'art')
    assert.equal(decoded.musicMessage?.style, 1)
    assert.equal(proto.Message.MusicMessage.MusicMessageStyle.VINYL, 1)
})

test('protobuf advertises host write mutations in device capabilities field 12', () => {
    const wire = hexToBytes('62090a0761726368697665')
    const capabilities = { hostWriteMutationSupport: { mutationNames: ['archive'] } }

    assertWire(proto.DeviceCapabilities.encode(capabilities).finish(), wire)
    assert.deepEqual(
        proto.DeviceCapabilities.decode(wire).hostWriteMutationSupport?.mutationNames,
        ['archive']
    )
})

test('protobuf retains the historical newsletter profile wrapper at field 117', () => {
    const wire = hexToBytes('aa07060a040a026f6b')
    const message = {
        newsletterAdminProfileMessageV2: { message: { conversation: 'ok' } }
    }

    assertWire(proto.Message.encode(message).finish(), wire)
    assert.equal(
        proto.Message.decode(wire).newsletterAdminProfileMessageV2?.message?.conversation,
        'ok'
    )
})

test('protobuf uses unsigned fixed32 colors for current solid wallpapers', () => {
    const wire = hexToBytes('0d030201ff15060504ff1801')
    const wallpaper = {
        backgroundLightArgb: 0xff010203,
        backgroundDarkArgb: 0xff040506,
        isDoodleEnabled: true
    }

    assertWire(proto.Message.ChatSolidColorWallpaper.encode(wallpaper).finish(), wire)
    const decoded = proto.Message.ChatSolidColorWallpaper.decode(wire)
    assert.equal(decoded.backgroundLightArgb, 0xff010203)
    assert.equal(decoded.backgroundDarkArgb, 0xff040506)
    assert.equal(decoded.isDoodleEnabled, true)
})

test('protobuf preserves historical string wallpaper fields as unknown wire data', () => {
    const wire = hexToBytes('0a04626c756512046461726b')
    const decoded = proto.Message.ChatSolidColorWallpaper.decode(wire)

    assert.equal(Object.prototype.hasOwnProperty.call(decoded, 'backgroundLightArgb'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(decoded, 'backgroundDarkArgb'), false)
    assert.ok(decoded.$unknowns)
    assert.equal(decoded.$unknowns.length, 2)
    assertWire(decoded.$unknowns[0], wire.subarray(0, 6))
    assertWire(decoded.$unknowns[1], wire.subarray(6))
    assertWire(proto.Message.ChatSolidColorWallpaper.encode(decoded).finish(), wire)
})

test('protobuf exposes animated wallpapers and clears alternatives through the oneof selector', () => {
    const wire = hexToBytes('720a0a03616e69150000003f')
    const decoded = proto.Message.ChatThemeSetting.decode(wire)

    assert.equal(decoded.wallpaper, 'animatedWallpaper')
    assert.equal(decoded.animatedWallpaper?.animatedWallpaperId, 'ani')
    assert.equal(decoded.animatedWallpaper?.dimLevel, 0.5)
    assertWire(proto.Message.ChatThemeSetting.encode(decoded).finish(), wire)

    const theme = new proto.Message.ChatThemeSetting({
        defaultWallpaper: { isDoodleEnabled: true },
        solidColor: { backgroundLightArgb: 0xff010203 }
    })
    assert.equal(theme.wallpaper, 'solidColor')
    theme.wallpaper = 'defaultWallpaper'
    assert.equal(Object.prototype.hasOwnProperty.call(theme, 'solidColor'), false)
    assert.equal(theme.defaultWallpaper?.isDoodleEnabled, true)
    theme.wallpaper = undefined
    assert.equal(Object.prototype.hasOwnProperty.call(theme, 'defaultWallpaper'), false)
    assert.equal(theme.wallpaper, undefined)
})

test('protobuf preserves unknown varint and length-delimited message fields', () => {
    // conversation#1, an unknown varint#200 and unknown bytes#201.
    const wire = hexToBytes('0a026f6bc00c2aca0c02aabb')
    const decoded = proto.Message.decode(wire)

    assert.equal(decoded.conversation, 'ok')
    assert.ok(decoded.$unknowns)
    assert.equal(decoded.$unknowns.length, 2)
    assertWire(decoded.$unknowns[0], hexToBytes('c00c2a'))
    assertWire(decoded.$unknowns[1], hexToBytes('ca0c02aabb'))
    assertWire(proto.Message.encode(decoded).finish(), wire)
})

test('protobuf emits repeated shard and scan lengths unpacked and accepts both wire forms', () => {
    const shards = hexToBytes('7001709601')
    const scanLengths = hexToBytes('b00101b0019601')

    assertWire(proto.ClientPayload.encode({ shards: [1, 150] }).finish(), shards)
    assert.deepEqual(proto.ClientPayload.decode(shards).shards, [1, 150])
    assert.deepEqual(proto.ClientPayload.decode(hexToBytes('7203019601')).shards, [1, 150])
    assertWire(proto.Message.ImageMessage.encode({ scanLengths: [1, 150] }).finish(), scanLengths)
    assert.deepEqual(proto.Message.ImageMessage.decode(scanLengths).scanLengths, [1, 150])
    assert.deepEqual(
        proto.Message.ImageMessage.decode(hexToBytes('b20103019601')).scanLengths,
        [1, 150]
    )
})

test('protobuf exports the latest bot, audience and platform enum values', () => {
    assert.deepEqual(
        [
            proto.WebMessageInfo.StubType.BOT_PROACTIVE_MESSAGE_ENABLED,
            proto.WebMessageInfo.StubType.BOT_PROACTIVE_MESSAGE_DISABLED,
            proto.WebMessageInfo.StubType.BOT_PROACTIVE_MESSAGE_FIRST_TIME,
            proto.WebMessageInfo.StubType.DYNAMIC_AUDIENCE_LIST_CREATE,
            proto.WebMessageInfo.StubType.DYNAMIC_AUDIENCE_LIST_UPDATE_LINK,
            proto.ClientPayload.UserAgent.Platform.AUTOMOTIVE,
            proto.BotMetricsEntryPoint.SHARE,
            proto.BotCapabilityMetadata.BotCapabilityType.AI_STUDY_QUIZ_ENABLED,
            proto.BotMessageOrigin.BotMessageOriginType
                .BOT_MESSAGE_ORIGIN_TYPE_META_AI_THREAD_WELCOME
        ],
        [273, 274, 275, 276, 277, 41, 59, 82, 1]
    )
})

test('protobuf retains consumer messages and exports Armadillo and MultiDevice namespaces', () => {
    const consumerWire = hexToBytes('0a090a070a050a036f6c64')
    const consumer = { payload: { content: { messageText: { text: 'old' } } } }
    assertWire(proto.ConsumerApplication.encode(consumer).finish(), consumerWire)
    assert.equal(
        proto.ConsumerApplication.decode(consumerWire).payload?.content?.messageText?.text,
        'old'
    )

    const armadilloWire = hexToBytes('0a081206120412026f6b')
    const armadillo = { payload: { applicationData: { aiBotResponse: { messageText: 'ok' } } } }
    assertWire(proto.Armadillo.encode(armadillo).finish(), armadilloWire)
    assert.equal(
        proto.Armadillo.decode(armadilloWire).payload?.applicationData?.aiBotResponse?.messageText,
        'ok'
    )

    const multiDeviceWire = hexToBytes('0a090a0712050a030a0101')
    const multiDevice = {
        payload: {
            applicationData: {
                appStateSyncKeyRequest: { keyIds: [{ keyId: new Uint8Array([1]) }] }
            }
        }
    }
    assertWire(proto.MultiDevice.encode(multiDevice).finish(), multiDeviceWire)
    const keyId =
        proto.MultiDevice.decode(multiDeviceWire).payload?.applicationData?.appStateSyncKeyRequest
            ?.keyIds?.[0].keyId
    assert.ok(keyId)
    assertWire(keyId, new Uint8Array([1]))
})
