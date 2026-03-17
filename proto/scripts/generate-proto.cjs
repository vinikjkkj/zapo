const { existsSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const pbjs = require('protobufjs-cli/pbjs')
const pbts = require('protobufjs-cli/pbts')
const { minify } = require('terser')
const esbuild = require('esbuild')

const protoDir = path.resolve(__dirname, '..')
const rootDir = path.resolve(protoDir, '..')
const sourceProtoPath = path.join(protoDir, 'WAProto.proto')
const tempProtoPath = path.join(protoDir, 'WAProto.codegen.tmp.proto')
const tempTypesJsPath = path.join(protoDir, 'WAProto.types.codegen.tmp.js')
const tempBundleInputPath = path.join(protoDir, 'WAProto.bundle.codegen.tmp.js')
const outputJsPath = path.join(protoDir, 'index.js')
const outputDtsPath = path.join(protoDir, 'index.d.ts')

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`proto generation failed: ${message}`)
    process.exitCode = 1
})

async function main() {
    if (!existsSync(sourceProtoPath)) {
        throw new Error(`missing source proto file at ${sourceProtoPath}`)
    }

    const sourceProto = readFileSync(sourceProtoPath, 'utf8')
    const requiredFieldPattern = /^(\s*)required\s+/gm
    const requiredFieldMatches = sourceProto.match(requiredFieldPattern) ?? []
    const normalizedProto = sourceProto.replace(requiredFieldPattern, '$1optional ')
    let originalJsBytes = 0
    let bundledJsBytes = 0
    let minifiedJsBytes = 0
    let originalDtsBytes = 0
    let compactDtsBytes = 0

    writeFileSync(tempProtoPath, normalizedProto, 'utf8')

    try {
        const jsOutput = await runCli(pbjs, [
            '--target',
            'static-module',
            '--wrap',
            'commonjs',
            '--no-bundle',
            '--no-beautify',
            '--no-comments',
            '--no-create',
            '--no-convert',
            '--no-delimited',
            '--no-verify',
            '--no-typeurl',
            '--no-service',
            tempProtoPath
        ])

        originalJsBytes = Buffer.byteLength(jsOutput, 'utf8')

        writeFileSync(tempBundleInputPath, jsOutput, 'utf8')

        const bundleResult = await esbuild.build({
            entryPoints: [tempBundleInputPath],
            bundle: true,
            format: 'cjs',
            platform: 'node',
            target: 'es2020',
            write: false,
            minify: false
        })

        const bundledJs = bundleResult.outputFiles[0].text
        bundledJsBytes = Buffer.byteLength(bundledJs, 'utf8')

        const minifiedJs = await minify(bundledJs, {
            ecma: 2020,
            compress: {
                defaults: true,
                passes: 3,
                toplevel: true
            },
            mangle: {
                toplevel: true
            },
            format: {
                comments: false
            }
        })

        if (!minifiedJs.code) {
            throw new Error('terser minification returned empty output')
        }

        minifiedJsBytes = Buffer.byteLength(minifiedJs.code, 'utf8')

        writeFileSync(outputJsPath, minifiedJs.code, 'utf8')

        const typesJsOutput = await runCli(pbjs, [
            '--target',
            'static-module',
            '--wrap',
            'commonjs',
            '--no-bundle',
            '--no-beautify',
            '--no-create',
            '--no-convert',
            '--no-delimited',
            '--no-verify',
            '--no-typeurl',
            '--no-service',
            tempProtoPath
        ])

        writeFileSync(tempTypesJsPath, typesJsOutput, 'utf8')

        const dtsOutput = await runCli(pbts, ['--no-comments', tempTypesJsPath])
        const compactDtsOutput = toCompactReadableDts(toSelfContainedDts(dtsOutput))
        originalDtsBytes = Buffer.byteLength(dtsOutput, 'utf8')
        compactDtsBytes = Buffer.byteLength(compactDtsOutput, 'utf8')
        writeFileSync(outputDtsPath, compactDtsOutput, 'utf8')
    } finally {
        for (const tmpFile of [tempProtoPath, tempTypesJsPath, tempBundleInputPath]) {
            if (existsSync(tmpFile)) {
                rmSync(tmpFile)
            }
        }
    }

    console.log(
        [
            'proto generation completed',
            `required fields normalized: ${requiredFieldMatches.length}`,
            'protobufjs-cli: proto/package.json',
            `js bundled (protobufjs/minimal inlined): yes`,
            `js size: ${formatBytes(originalJsBytes)} -> ${formatBytes(bundledJsBytes)} (bundled) -> ${formatBytes(minifiedJsBytes)} (minified)`,
            `d.ts compacted: yes`,
            `d.ts size: ${formatBytes(originalDtsBytes)} -> ${formatBytes(compactDtsBytes)}`,
            `js output: ${path.relative(rootDir, outputJsPath)}`,
            `types output: ${path.relative(rootDir, outputDtsPath)}`
        ].join(' | ')
    )
}

function runCli(cli, args) {
    return new Promise((resolve, reject) => {
        cli.main(args, (error, output) => {
            if (error) {
                reject(error)
                return
            }

            resolve(typeof output === 'string' ? output : '')
        })
    })
}

function formatBytes(bytes) {
    const kb = bytes / 1024
    return `${kb.toFixed(1)} KiB`
}

function toCompactReadableDts(source) {
    return source
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/^( {4})+/gm, (indent) => '\t'.repeat(indent.length / 4))
        .replace(/;(?=\n|$)/g, '')
        .replace(/\n{2,}/g, '\n')
}

/**
 * Replaces external `protobufjs` and `long` type imports with inline
 * minimal type declarations so the generated .d.ts is self-contained.
 */
function toSelfContainedDts(source) {
    const inlineTypes = [
        '/** Minimal protobuf Reader interface used by decode methods. */',
        'interface PbReader {',
        '    len: number',
        '    pos: number',
        '    uint32(): number',
        '    int32(): number',
        '    int64(): Long',
        '    uint64(): Long',
        '    sint32(): number',
        '    sint64(): Long',
        '    bool(): boolean',
        '    fixed32(): number',
        '    sfixed32(): number',
        '    fixed64(): Long',
        '    sfixed64(): Long',
        '    float(): number',
        '    double(): number',
        '    bytes(): Uint8Array',
        '    string(): string',
        '    skipType(wireType: number): this',
        '}',
        '',
        '/** Minimal protobuf Writer interface used by encode methods. */',
        'interface PbWriter {',
        '    uint32(value: number): PbWriter',
        '    int32(value: number): PbWriter',
        '    int64(value: number | Long): PbWriter',
        '    uint64(value: number | Long): PbWriter',
        '    sint32(value: number): PbWriter',
        '    sint64(value: number | Long): PbWriter',
        '    bool(value: boolean): PbWriter',
        '    fixed32(value: number): PbWriter',
        '    sfixed32(value: number): PbWriter',
        '    fixed64(value: number | Long): PbWriter',
        '    sfixed64(value: number | Long): PbWriter',
        '    float(value: number): PbWriter',
        '    double(value: number): PbWriter',
        '    bytes(value: Uint8Array): PbWriter',
        '    string(value: string): PbWriter',
        '    fork(): PbWriter',
        '    ldelim(): PbWriter',
        '    finish(): Uint8Array',
        '}',
        '',
        '/** int64/uint64 value representation. */',
        'type Long = number | { low: number; high: number; unsigned: boolean; toNumber(): number }',
        ''
    ].join('\n')

    return source
        .replace(/import \* as \$protobuf from "protobufjs".*\n?/, '')
        .replace(/import Long = require\("long"\).*\n?/, '')
        .replace(/\$protobuf\.Writer/g, 'PbWriter')
        .replace(/\$protobuf\.Reader/g, 'PbReader')
        .replace(
            /(export namespace waproto)/,
            `${inlineTypes}\n$1`
        )
}
