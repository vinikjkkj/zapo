import { hkdf, hmacSign, importHmacKey } from '@crypto'
import { proto, type Proto } from '@proto'
import type { BinaryNode } from '@transport/types'
import {
    base64ToBytesChecked,
    concatBytes,
    EMPTY_BYTES,
    TEXT_ENCODER,
    toBytesView
} from '@util/bytes'

const WA_REPORTING_TOKEN_BYTES = 16
const WA_REPORTING_TOKEN_KEY_BYTES = 32
const WA_REPORTING_TOKEN_USE_CASE = 'Report Token'
const WA_REPORTING_TOKEN_CONFIG_BASE64 =
    'CgQIARIACjQIAxIwKgQIAhIAKgQIAxIAKgQICBIAKgQICxIAKhAIERIMKgQIFRIAKgQIFhIAKgQIGRIACioIBBImCAIqBggBEgIIAioGCBASAggCKhIIERIOCAIqBAgVEgAqBAgWEgAKOggFEjYIAioGCAMSAggCKgYIBBICCAIqBggFEgIIAioGCBASAggCKhIIERIOCAIqBAgVEgAqBAgWEgAKIggGEh4qBAgBEgAqEAgREgwqBAgVEgAqBAgWEgAqBAgeEgAKLggHEioqBAgCEgAqBAgHEgAqBAgKEgAqEAgREgwqBAgVEgAqBAgWEgAqBAgUEgAKLggIEioqBAgCEgAqBAgHEgAqBAgJEgAqEAgREgwqBAgVEgAqBAgWEgAqBAgVEgAKNAgJEjAqBAgCEgAqBAgGEgAqBAgHEgAqBAgNEgAqEAgREgwqBAgVEgAqBAgWEgAqBAgUEgAKKAgMEiQIAioGCAESAggCKgYIAhICCAIqCAgOEgQIAiABKgYIDxICCAIKKggSEiYIAioGCAYSAggCKgYIEBICCAIqEggREg4IAioECBUSACoECBYSAAouCBoSKioECAQSACoECAUSACoECAgSACoECA0SACoQCBESDCoECBUSACoECBYSAApCCBwSPggCKgYIARICCAIqBggCEgIIAioGCAQSAggCKgYIBRICCAIqBggGEgIIAioSCAcSDggCKgQIFRIAKgQIFhIACgwIJRIIKgYIARICIAEKUggxEk4IAioGCAISAggCKhYIAxISCAIqBggBEgIIAioGCAISAggCKhIIBRIOCAIqBAgVEgAqBAgWEgAqFggIEhIIAioGCAESAggCKgYIAhICCAIKDAg1EggqBggBEgIgAQoOCDcSCggCKgYIARICIAEKDgg6EgoIAioGCAESAiABCg4IOxIKCAIqBggBEgIgAQpSCDwSTggCKgYIAhICCAIqFggDEhIIAioGCAESAggCKgYIAhICCAIqEggFEg4IAioECBUSACoECBYSACoWCAgSEggCKgYIARICCAIqBggCEgIIAgpSCEASTggCKgYIAhICCAIqFggDEhIIAioGCAESAggCKgYIAhICCAIqEggFEg4IAioECBUSACoECBYSACoWCAgSEggCKgYIARICCAIqBggCEgIIAgo2CEISMggCKgQIAhIAKgQIBhIAKgQIBxIAKgQIDRIAKhAIERIMKgQIFRIAKgQIFhIAKgQIFBIACg4IShIKCAIqBggBEgIgAQoOCFcSCggCKgYIARICIAEKMghYEi4IAioGCAESAggCKg4IAhIKCAIqBggBEgIIAioSCAMSDggCKgQIFRIAKgQIFhIACg4IXBIKCAIqBggBEgIgAQoOCF0SCggCKgYIARICIAEKDgheEgoIAioGCAESAiAB'
const WA_REPORTING_TOKEN_CONFIG_BYTES = base64ToBytesChecked(
    WA_REPORTING_TOKEN_CONFIG_BASE64,
    'reporting_token.config'
)

export const WA_REPORTING_TOKEN_VERSION = 2

interface ReportingTokenFieldSpec {
    readonly minVersion: number
    readonly maxVersion: number | null
    readonly isMessage: boolean
    readonly subfields: ReadonlyMap<number, ReportingTokenFieldSpec> | null
}

interface ReportingTokenConfigSpec {
    readonly fields: ReadonlyMap<number, ReportingTokenFieldSpec>
}

interface ReportingTokenField {
    readonly fieldNumber: number
    readonly isMessage: boolean
    readonly subfields: ReportingTokenConfig | null
}

interface ReportingTokenConfig {
    readonly fields: ReadonlyMap<number, ReportingTokenField>
}

interface ParsedProtobufField {
    readonly tag: number
    readonly fieldNumber: number
    readonly wireType: number
    readonly start: number
    readonly next: number
    readonly valueStart: number
    readonly valueEnd: number
}

interface VarintReadResult {
    readonly value: number
    readonly next: number
}

interface ExtractedFieldPart {
    readonly fieldNumber: number
    readonly bytes: Uint8Array
}

interface ExtractedFieldSet {
    readonly parts: readonly ExtractedFieldPart[]
    readonly totalSize: number
}

export interface BuildReportingTokenNodeInput {
    readonly message: Proto.IMessage
    readonly stanzaId: string
    readonly senderUserJid: string
    readonly remoteJid: string
    readonly version?: number
}

export interface BuildReportingTokenArtifactsResult {
    readonly node: BinaryNode
    readonly version: number
    readonly reportingToken: Uint8Array
    readonly reportingTokenContent: Uint8Array
    readonly reportingTokenKey: Uint8Array
}

let reportingTokenConfigSpec: ReportingTokenConfigSpec | null = null
const reportingTokenConfigCache = new Map<number, ReportingTokenConfig>()

export async function buildReportingTokenArtifacts(
    input: BuildReportingTokenNodeInput
): Promise<BuildReportingTokenArtifactsResult | null> {
    const stanzaId = input.stanzaId.trim()
    if (!stanzaId || !isMessageReportingTokenCompatible(input.message)) {
        return null
    }

    const messageSecret = input.message.messageContextInfo?.messageSecret
    if (!messageSecret || toBytesView(messageSecret).byteLength === 0) {
        return null
    }

    const reportingTokenContent = computeReportingTokenContent(
        proto.Message.encode(input.message).finish(),
        input.version ?? WA_REPORTING_TOKEN_VERSION
    )
    if (reportingTokenContent.byteLength === 0) {
        return null
    }

    const secretInfo = concatBytes([
        TEXT_ENCODER.encode(stanzaId),
        TEXT_ENCODER.encode(input.senderUserJid),
        TEXT_ENCODER.encode(input.remoteJid),
        TEXT_ENCODER.encode(WA_REPORTING_TOKEN_USE_CASE)
    ])
    const reportingTokenKey = await hkdf(
        toBytesView(messageSecret),
        null,
        secretInfo,
        WA_REPORTING_TOKEN_KEY_BYTES
    )
    const hmacKey = await importHmacKey(reportingTokenKey)
    const reportingToken = (await hmacSign(hmacKey, reportingTokenContent)).subarray(
        0,
        WA_REPORTING_TOKEN_BYTES
    )

    const version = input.version ?? WA_REPORTING_TOKEN_VERSION
    return {
        node: {
            tag: 'reporting',
            attrs: {},
            content: [
                {
                    tag: 'reporting_token',
                    attrs: {
                        v: String(version)
                    },
                    content: reportingToken
                }
            ]
        },
        version,
        reportingToken,
        reportingTokenContent,
        reportingTokenKey
    }
}

function isMessageReportingTokenCompatible(message: Proto.IMessage): boolean {
    return (
        !message.reactionMessage &&
        !message.encReactionMessage &&
        !message.encEventResponseMessage &&
        !message.pollUpdateMessage
    )
}

function computeReportingTokenContent(messageBytes: Uint8Array, version: number): Uint8Array {
    const reportingConfig = getReportingTokenConfig(version)
    const extracted = extractProtobufFieldParts(
        messageBytes,
        0,
        messageBytes.length,
        reportingConfig,
        reportingConfig
    )
    if (extracted.totalSize === 0) {
        return EMPTY_BYTES
    }

    return concatBytes(extracted.parts.map((p) => p.bytes))
}

function getReportingTokenConfig(version: number): ReportingTokenConfig {
    const cached = reportingTokenConfigCache.get(version)
    if (cached) {
        return cached
    }

    const spec = getReportingTokenConfigSpec()
    const fields = new Map<number, ReportingTokenField>()
    for (const [fieldNumber, fieldSpec] of spec.fields) {
        const selectedField = selectFieldForVersion(version, fieldNumber, fieldSpec)
        if (selectedField) {
            fields.set(fieldNumber, selectedField)
        }
    }

    const config: ReportingTokenConfig = { fields }
    reportingTokenConfigCache.set(version, config)
    return config
}

function getReportingTokenConfigSpec(): ReportingTokenConfigSpec {
    if (reportingTokenConfigSpec) {
        return reportingTokenConfigSpec
    }

    reportingTokenConfigSpec = parseReportingTokenConfigSpec(WA_REPORTING_TOKEN_CONFIG_BYTES)
    return reportingTokenConfigSpec
}

function parseReportingTokenConfigSpec(bytes: Uint8Array): ReportingTokenConfigSpec {
    let cursor = 0
    const fields = new Map<number, ReportingTokenFieldSpec>()

    while (cursor < bytes.length) {
        const tag = readVarint(bytes, cursor, bytes.length)
        cursor = tag.next
        const fieldNumber = Math.floor(tag.value / 8)
        const wireType = tag.value & 0x07

        if (fieldNumber === 1 && wireType === 2) {
            const lengthInfo = readVarint(bytes, cursor, bytes.length)
            const entryStart = lengthInfo.next
            const entryEnd = entryStart + lengthInfo.value
            if (entryEnd > bytes.length) {
                throw new Error('invalid reporting token config map entry length')
            }

            const parsedEntry = parseReportingTokenConfigMapEntry(bytes, entryStart, entryEnd)
            if (parsedEntry) {
                fields.set(parsedEntry.key, parsedEntry.value)
            }

            cursor = entryEnd
            continue
        }

        cursor = skipField(bytes, cursor, bytes.length, wireType)
    }

    return { fields }
}

function parseReportingTokenConfigMapEntry(
    bytes: Uint8Array,
    start: number,
    end: number
): { readonly key: number; readonly value: ReportingTokenFieldSpec } | null {
    let cursor = start
    let key: number | null = null
    let value: ReportingTokenFieldSpec | null = null

    while (cursor < end) {
        const tag = readVarint(bytes, cursor, end)
        cursor = tag.next
        const fieldNumber = Math.floor(tag.value / 8)
        const wireType = tag.value & 0x07

        if (fieldNumber === 1 && wireType === 0) {
            const keyVarint = readVarint(bytes, cursor, end)
            key = keyVarint.value
            cursor = keyVarint.next
            continue
        }

        if (fieldNumber === 2 && wireType === 2) {
            const valueLength = readVarint(bytes, cursor, end)
            const valueStart = valueLength.next
            const valueEnd = valueStart + valueLength.value
            if (valueEnd > end) {
                throw new Error('invalid reporting token config field value length')
            }
            value = parseReportingTokenFieldSpec(bytes, valueStart, valueEnd)
            cursor = valueEnd
            continue
        }

        cursor = skipField(bytes, cursor, end, wireType)
    }

    if (key === null || value === null) {
        return null
    }
    return { key, value }
}

function parseReportingTokenFieldSpec(
    bytes: Uint8Array,
    start: number,
    end: number
): ReportingTokenFieldSpec {
    let cursor = start
    let minVersion = 1
    let maxVersion: number | null = null
    let isMessage = false
    const subfields = new Map<number, ReportingTokenFieldSpec>()

    while (cursor < end) {
        const tag = readVarint(bytes, cursor, end)
        cursor = tag.next
        const fieldNumber = Math.floor(tag.value / 8)
        const wireType = tag.value & 0x07

        if (fieldNumber === 1 && wireType === 0) {
            const value = readVarint(bytes, cursor, end)
            minVersion = value.value
            cursor = value.next
            continue
        }

        if (fieldNumber === 2 && wireType === 0) {
            const value = readVarint(bytes, cursor, end)
            maxVersion = value.value
            cursor = value.next
            continue
        }

        if (fieldNumber === 4 && wireType === 0) {
            const value = readVarint(bytes, cursor, end)
            isMessage = value.value !== 0
            cursor = value.next
            continue
        }

        if (fieldNumber === 5 && wireType === 2) {
            const lengthInfo = readVarint(bytes, cursor, end)
            const entryStart = lengthInfo.next
            const entryEnd = entryStart + lengthInfo.value
            if (entryEnd > end) {
                throw new Error('invalid reporting token subfield map entry length')
            }

            const parsedEntry = parseReportingTokenConfigMapEntry(bytes, entryStart, entryEnd)
            if (parsedEntry) {
                subfields.set(parsedEntry.key, parsedEntry.value)
            }

            cursor = entryEnd
            continue
        }

        cursor = skipField(bytes, cursor, end, wireType)
    }

    return {
        minVersion,
        maxVersion,
        isMessage,
        subfields: subfields.size > 0 ? subfields : null
    }
}

function selectFieldForVersion(
    version: number,
    fieldNumber: number,
    fieldSpec: ReportingTokenFieldSpec
): ReportingTokenField | null {
    if (version < fieldSpec.minVersion) {
        return null
    }
    if (fieldSpec.maxVersion !== null && version > fieldSpec.maxVersion) {
        return null
    }

    if (!fieldSpec.subfields) {
        return {
            fieldNumber,
            isMessage: fieldSpec.isMessage,
            subfields: null
        }
    }

    const selectedSubfields = new Map<number, ReportingTokenField>()
    for (const [subFieldNumber, subFieldSpec] of fieldSpec.subfields) {
        const selectedField = selectFieldForVersion(version, subFieldNumber, subFieldSpec)
        if (selectedField) {
            selectedSubfields.set(subFieldNumber, selectedField)
        }
    }

    return {
        fieldNumber,
        isMessage: fieldSpec.isMessage,
        subfields: {
            fields: selectedSubfields
        }
    }
}

function extractProtobufFieldParts(
    bytes: Uint8Array,
    start: number,
    end: number,
    config: ReportingTokenConfig,
    rootConfig: ReportingTokenConfig
): ExtractedFieldSet {
    const parts: ExtractedFieldPart[] = []
    let totalSize = 0
    let cursor = start

    while (cursor < end) {
        const parsedField = parseProtobufField(bytes, cursor, end)
        cursor = parsedField.next

        const configuredField = config.fields.get(parsedField.fieldNumber)
        if (!configuredField) {
            continue
        }

        if (!configuredField.isMessage && isExtractWholeField(configuredField)) {
            const fieldBytes = bytes.subarray(parsedField.start, parsedField.next)
            parts.push({
                fieldNumber: parsedField.fieldNumber,
                bytes: fieldBytes
            })
            totalSize += fieldBytes.length
            continue
        }

        if (parsedField.wireType !== 2) {
            continue
        }

        const nestedConfig = configuredField.isMessage ? rootConfig : configuredField.subfields
        if (!nestedConfig) {
            continue
        }

        const nestedFields = extractProtobufFieldParts(
            bytes,
            parsedField.valueStart,
            parsedField.valueEnd,
            nestedConfig,
            rootConfig
        )
        if (nestedFields.parts.length === 0 || nestedFields.totalSize === 0) {
            continue
        }

        const tagBytes = encodeVarint(parsedField.tag)
        const nestedLengthBytes = encodeVarint(nestedFields.totalSize)
        const fieldBytes = new Uint8Array(
            tagBytes.length + nestedLengthBytes.length + nestedFields.totalSize
        )
        fieldBytes.set(tagBytes, 0)
        fieldBytes.set(nestedLengthBytes, tagBytes.length)
        let nestedOffset = tagBytes.length + nestedLengthBytes.length
        for (const nestedPart of nestedFields.parts) {
            fieldBytes.set(nestedPart.bytes, nestedOffset)
            nestedOffset += nestedPart.bytes.length
        }

        parts.push({
            fieldNumber: parsedField.fieldNumber,
            bytes: fieldBytes
        })
        totalSize += fieldBytes.length
    }

    parts.sort((left, right) => left.fieldNumber - right.fieldNumber)
    return {
        parts,
        totalSize
    }
}

function isExtractWholeField(field: ReportingTokenField): boolean {
    return !field.subfields || field.subfields.fields.size === 0
}

function parseProtobufField(bytes: Uint8Array, start: number, end: number): ParsedProtobufField {
    const tag = readVarint(bytes, start, end)
    const tagValue = tag.value
    if (tagValue <= 0 || tagValue > 4_294_967_295) {
        throw new Error(`protobuf field tag out of bounds: ${tagValue}`)
    }

    const fieldNumber = Math.floor(tagValue / 8)
    if (fieldNumber < 1) {
        throw new Error(`invalid protobuf field number: ${fieldNumber}`)
    }

    const wireType = tagValue & 0x07
    if (wireType === 0) {
        const value = readVarint(bytes, tag.next, end)
        return {
            tag: tagValue,
            fieldNumber,
            wireType,
            start,
            next: value.next,
            valueStart: value.next,
            valueEnd: value.next
        }
    }
    if (wireType === 1) {
        const next = tag.next + 8
        if (next > end) {
            throw new Error('invalid protobuf fixed64 field length')
        }
        return {
            tag: tagValue,
            fieldNumber,
            wireType,
            start,
            next,
            valueStart: next,
            valueEnd: next
        }
    }
    if (wireType === 2) {
        const valueLength = readVarint(bytes, tag.next, end)
        const valueStart = valueLength.next
        const valueEnd = valueStart + valueLength.value
        if (valueEnd > end) {
            throw new Error('invalid protobuf length-delimited field length')
        }
        return {
            tag: tagValue,
            fieldNumber,
            wireType,
            start,
            next: valueEnd,
            valueStart,
            valueEnd
        }
    }
    if (wireType === 5) {
        const next = tag.next + 4
        if (next > end) {
            throw new Error('invalid protobuf fixed32 field length')
        }
        return {
            tag: tagValue,
            fieldNumber,
            wireType,
            start,
            next,
            valueStart: next,
            valueEnd: next
        }
    }
    throw new Error(`unsupported protobuf wire type: ${wireType}`)
}

function readVarint(bytes: Uint8Array, start: number, end: number): VarintReadResult {
    let cursor = start
    let value = 0
    let factor = 1

    while (cursor < end) {
        const byte = bytes[cursor]
        value += (byte & 0x7f) * factor
        if (!Number.isSafeInteger(value)) {
            throw new Error('varint exceeds safe integer range')
        }

        cursor += 1
        if ((byte & 0x80) === 0) {
            return {
                value,
                next: cursor
            }
        }

        factor *= 128
        if (factor > 2 ** 56) {
            throw new Error('varint exceeds supported range')
        }
    }

    throw new Error('unexpected end of buffer while reading varint')
}

function skipField(bytes: Uint8Array, start: number, end: number, wireType: number): number {
    if (wireType === 0) {
        return readVarint(bytes, start, end).next
    }
    if (wireType === 1) {
        const next = start + 8
        if (next > end) {
            throw new Error('invalid fixed64 field size while skipping')
        }
        return next
    }
    if (wireType === 2) {
        const lengthInfo = readVarint(bytes, start, end)
        const next = lengthInfo.next + lengthInfo.value
        if (next > end) {
            throw new Error('invalid length-delimited field size while skipping')
        }
        return next
    }
    if (wireType === 5) {
        const next = start + 4
        if (next > end) {
            throw new Error('invalid fixed32 field size while skipping')
        }
        return next
    }
    throw new Error(`unsupported wire type while skipping field: ${wireType}`)
}

function encodeVarint(value: number): Uint8Array {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`invalid varint value: ${value}`)
    }
    if (value === 0) {
        return new Uint8Array([0])
    }

    const bytes: number[] = []
    let current = value
    while (current >= 128) {
        bytes.push((current % 128) + 128)
        current = Math.floor(current / 128)
    }
    bytes.push(current)
    return new Uint8Array(bytes)
}
