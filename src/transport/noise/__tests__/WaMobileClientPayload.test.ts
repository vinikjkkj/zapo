import assert from 'node:assert/strict'
import test from 'node:test'

import { proto } from '@proto'
import {
    buildMobileLoginPayload,
    WA_MOBILE_PLATFORMS,
    type WaMobileTransportDeviceInfo
} from '@transport/noise/WaMobileClientPayload'

const BASE_DEVICE: WaMobileTransportDeviceInfo = {
    manufacturer: 'motorola',
    device: 'moto_g52',
    osVersion: '12',
    osBuildNumber: 'S1SRS32.38-132-8',
    appVersion: '2.26.15.11',
    mcc: '724',
    mnc: '03',
    localeLanguageIso6391: 'pt',
    localeCountryIso31661Alpha2: 'BR',
    phoneId: '00000000-0000-0000-0000-000000000001'
}

test('buildMobileLoginPayload emits an ANDROID userAgent with primary flags', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: BASE_DEVICE
    })
    const payload = proto.ClientPayload.decode(bytes)
    assert.equal(payload.passive, false)
    assert.equal(payload.pull, true)
    assert.equal(payload.device, 0)
    assert.equal(String(payload.username), '5511987654321')
    const ua = payload.userAgent
    assert.ok(ua, 'userAgent is set')
    assert.equal(ua.platform, proto.ClientPayload.UserAgent.Platform.ANDROID)
    assert.equal(ua.releaseChannel, proto.ClientPayload.UserAgent.ReleaseChannel.RELEASE)
    assert.equal(ua.manufacturer, 'motorola')
    assert.equal(ua.device, 'moto_g52')
    assert.equal(ua.osVersion, '12')
    assert.equal(ua.osBuildNumber, 'S1SRS32.38-132-8')
    assert.equal(ua.mcc, '724')
    assert.equal(ua.mnc, '03')
    assert.equal(ua.localeLanguageIso6391, 'pt')
    assert.equal(ua.localeCountryIso31661Alpha2, 'BR')
    assert.equal(ua.phoneId, '00000000-0000-0000-0000-000000000001')
    assert.ok(ua.appVersion, 'appVersion parsed')
    assert.equal(ua.appVersion.primary, 2)
    assert.equal(ua.appVersion.secondary, 26)
    assert.equal(ua.appVersion.tertiary, 15)
})

test('buildMobileLoginPayload emits SMB_ANDROID platform for business accounts', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: { ...BASE_DEVICE, business: true }
    })
    const payload = proto.ClientPayload.decode(bytes)
    assert.equal(payload.userAgent?.platform, proto.ClientPayload.UserAgent.Platform.SMB_ANDROID)
})

test('buildMobileLoginPayload keeps ANDROID platform when business is false', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: { ...BASE_DEVICE, business: false }
    })
    const payload = proto.ClientPayload.decode(bytes)
    assert.equal(payload.userAgent?.platform, proto.ClientPayload.UserAgent.Platform.ANDROID)
})

test('buildMobileLoginPayload is unchanged when business is omitted', () => {
    const omitted = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: BASE_DEVICE
    })
    const explicitUndefined = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: { ...BASE_DEVICE, business: undefined }
    })
    // Omitting the flag must produce the exact same bytes as an explicit
    // undefined, and the platform stays consumer ANDROID.
    assert.deepEqual(omitted, explicitUndefined)
    assert.equal(
        proto.ClientPayload.decode(omitted).userAgent?.platform,
        proto.ClientPayload.UserAgent.Platform.ANDROID
    )
})

test('buildMobileLoginPayload sets passive=true when requested', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        passive: true,
        deviceInfo: BASE_DEVICE
    })
    const payload = proto.ClientPayload.decode(bytes)
    assert.equal(payload.passive, true)
})

test('buildMobileLoginPayload defaults missing mcc/mnc and generates a phoneId', () => {
    const partial: WaMobileTransportDeviceInfo = {
        manufacturer: BASE_DEVICE.manufacturer,
        device: BASE_DEVICE.device,
        osVersion: BASE_DEVICE.osVersion,
        osBuildNumber: BASE_DEVICE.osBuildNumber,
        appVersion: BASE_DEVICE.appVersion,
        localeLanguageIso6391: BASE_DEVICE.localeLanguageIso6391,
        localeCountryIso31661Alpha2: BASE_DEVICE.localeCountryIso31661Alpha2
    }
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: partial
    })
    const payload = proto.ClientPayload.decode(bytes)
    const ua = payload.userAgent
    assert.ok(ua)
    assert.equal(ua.mcc, '000')
    assert.equal(ua.mnc, '000')
    assert.match(ua.phoneId ?? '', /^[0-9a-f-]{36}$/)
})

test('buildMobileLoginPayload rejects non-positive usernames', () => {
    assert.throws(
        () => buildMobileLoginPayload({ username: 0, deviceInfo: BASE_DEVICE }),
        /valid numeric username/
    )
    assert.throws(
        () => buildMobileLoginPayload({ username: -1, deviceInfo: BASE_DEVICE }),
        /valid numeric username/
    )
})

test('buildMobileLoginPayload honours custom device slot', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        device: 2,
        deviceInfo: BASE_DEVICE
    })
    const payload = proto.ClientPayload.decode(bytes)
    assert.equal(payload.device, 2)
})

test('buildMobileLoginPayload populates quaternary app version when present', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: { ...BASE_DEVICE, appVersion: '2.26.15.11' }
    })
    const payload = proto.ClientPayload.decode(bytes)
    assert.ok(payload.userAgent?.appVersion)
    assert.equal(payload.userAgent.appVersion.primary, 2)
    assert.equal(payload.userAgent.appVersion.secondary, 26)
    assert.equal(payload.userAgent.appVersion.tertiary, 15)
    assert.equal(payload.userAgent.appVersion.quaternary, 11)
})

test('buildMobileLoginPayload leaves quaternary unset when version has 3 parts', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: { ...BASE_DEVICE, appVersion: '2.26.15' }
    })
    const payload = proto.ClientPayload.decode(bytes)
    assert.ok(payload.userAgent?.appVersion)
    assert.ok(!payload.userAgent.appVersion.quaternary)
})

test('buildMobileLoginPayload sets deviceType=PHONE and product=WHATSAPP explicitly', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: BASE_DEVICE
    })
    const payload = proto.ClientPayload.decode(bytes)
    assert.equal(payload.product, proto.ClientPayload.Product.WHATSAPP)
    assert.equal(payload.userAgent?.deviceType, proto.ClientPayload.UserAgent.DeviceType.PHONE)
})

test('buildMobileLoginPayload forwards deviceBoard and deviceModelType from deviceInfo', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: {
            ...BASE_DEVICE,
            deviceBoard: 'MSM8953',
            deviceModelType: 'moto g(52)'
        }
    })
    const payload = proto.ClientPayload.decode(bytes)
    assert.equal(payload.userAgent?.deviceBoard, 'MSM8953')
    assert.equal(payload.userAgent?.deviceModelType, 'moto g(52)')
})

test('buildMobileLoginPayload forwards pushName, yearClass and memClass when provided', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: BASE_DEVICE,
        pushName: 'Test User',
        yearClass: 2016,
        memClass: 256
    })
    const payload = proto.ClientPayload.decode(bytes)
    assert.equal(payload.pushName, 'Test User')
    assert.equal(payload.yearClass, 2016)
    assert.equal(payload.memClass, 256)
})

test('buildMobileLoginPayload omits pushName/yearClass/memClass when absent', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: BASE_DEVICE
    })
    const payload = proto.ClientPayload.decode(bytes)
    assert.ok(!payload.pushName)
    assert.ok(!payload.yearClass)
    assert.ok(!payload.memClass)
})

test('buildMobileLoginPayload defaults platform to ANDROID and omits distributionChannel', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: BASE_DEVICE
    })
    const ua = proto.ClientPayload.decode(bytes).userAgent
    assert.ok(ua)
    assert.equal(ua.platform, proto.ClientPayload.UserAgent.Platform.ANDROID)
    assert.equal(Object.hasOwn(ua, 'distributionChannel'), false)
})

test('buildMobileLoginPayload emits an IOS userAgent with App Store distribution', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: {
            platform: WA_MOBILE_PLATFORMS.IOS,
            manufacturer: 'Apple',
            device: 'iPhone',
            osVersion: '18.4',
            osBuildNumber: '22E240',
            appVersion: '25.11.74',
            mcc: '724',
            mnc: '06',
            localeLanguageIso6391: 'pt',
            localeCountryIso31661Alpha2: 'BR',
            phoneId: '11111111-1111-1111-1111-111111111111',
            deviceModelType: 'iPhone 16 Pro'
        }
    })
    const ua = proto.ClientPayload.decode(bytes).userAgent
    assert.ok(ua)
    assert.equal(ua.platform, proto.ClientPayload.UserAgent.Platform.IOS)
    assert.equal(ua.manufacturer, 'Apple')
    assert.equal(ua.device, 'iPhone')
    assert.equal(ua.osVersion, '18.4')
    assert.equal(ua.osBuildNumber, '22E240')
    assert.equal(ua.deviceModelType, 'iPhone 16 Pro')
    assert.equal(ua.deviceType, proto.ClientPayload.UserAgent.DeviceType.PHONE)
    assert.equal(ua.distributionChannel, proto.ClientPayload.UserAgent.DistributionChannel.APPSTORE)
    assert.ok(ua.appVersion)
    assert.equal(ua.appVersion.primary, 25)
    assert.equal(ua.appVersion.secondary, 11)
    assert.equal(ua.appVersion.tertiary, 74)
})

test('buildMobileLoginPayload emits SMB_IOS when business is set on an iOS device', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: {
            platform: WA_MOBILE_PLATFORMS.IOS,
            business: true,
            manufacturer: 'Apple',
            device: 'iPhone',
            osVersion: '18.4',
            osBuildNumber: '22E240',
            appVersion: '25.11.74'
        }
    })
    const ua = proto.ClientPayload.decode(bytes).userAgent
    assert.equal(ua?.platform, proto.ClientPayload.UserAgent.Platform.SMB_IOS)
})

test('buildMobileLoginPayload honours an explicit android platform', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: { ...BASE_DEVICE, platform: WA_MOBILE_PLATFORMS.ANDROID }
    })
    const ua = proto.ClientPayload.decode(bytes).userAgent
    assert.ok(ua)
    assert.equal(ua.platform, proto.ClientPayload.UserAgent.Platform.ANDROID)
    assert.equal(Object.hasOwn(ua, 'distributionChannel'), false)
})

test('buildMobileLoginPayload forwards an explicit iOS distributionChannel override', () => {
    const bytes = buildMobileLoginPayload({
        username: 5511987654321,
        deviceInfo: {
            platform: 'ios',
            manufacturer: 'Apple',
            device: 'iPhone',
            osVersion: '18.4',
            osBuildNumber: '18.4',
            appVersion: '25.11.74',
            distributionChannel: proto.ClientPayload.UserAgent.DistributionChannel.TESTFLIGHT
        }
    })
    const ua = proto.ClientPayload.decode(bytes).userAgent
    assert.equal(
        ua?.distributionChannel,
        proto.ClientPayload.UserAgent.DistributionChannel.TESTFLIGHT
    )
})

test('buildMobileLoginPayload rejects unknown platforms', () => {
    assert.throws(
        () =>
            buildMobileLoginPayload({
                username: 5511987654321,
                deviceInfo: {
                    ...BASE_DEVICE,
                    platform: 'windows' as WaMobileTransportDeviceInfo['platform']
                }
            }),
        /platform 'android' or 'ios'/
    )
    assert.throws(
        () =>
            buildMobileLoginPayload({
                username: 5511987654321,
                deviceInfo: {
                    ...BASE_DEVICE,
                    platform: '__proto__' as WaMobileTransportDeviceInfo['platform']
                }
            }),
        /platform 'android' or 'ios'/
    )
})
