import assert from 'node:assert/strict'
import test from 'node:test'

import { proto } from '@proto'
import {
    buildMobileLoginPayload,
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
