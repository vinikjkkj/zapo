const {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    statSync,
    writeFileSync
} = require('node:fs')
const path = require('node:path')

const args = process.argv.slice(2)
const rootArgIndex = args.indexOf('--root')
const protoBridge = args.includes('--proto-bridge')
const projectRoot =
    rootArgIndex >= 0 && args[rootArgIndex + 1]
        ? path.resolve(args[rootArgIndex + 1])
        : process.cwd()
const esmDir = path.join(projectRoot, 'dist', 'esm')
const esmScopePath = path.join(esmDir, 'package.json')

mkdirSync(esmDir, { recursive: true })

writeFileSync(esmScopePath, `${JSON.stringify({ type: 'module' }, null, 4)}\n`, 'utf8')

if (protoBridge) {
    const esmProtoPath = path.join(esmDir, 'proto.js')
    if (!existsSync(esmProtoPath)) {
        throw new Error(`missing ESM proto bridge at ${esmProtoPath}`)
    }
}

for (const filePath of listJsFiles(esmDir)) {
    const source = readFileSync(filePath, 'utf8')
    const transformed = normalizeEsmSpecifiers(filePath, source)

    if (transformed !== source) {
        writeFileSync(filePath, transformed, 'utf8')
    }
}

if (protoBridge) {
    const esmProtoPath = path.join(esmDir, 'proto.js')
    writeFileSync(
        esmProtoPath,
        [
            "import protoModule from '../proto.js'",
            '',
            'export const proto = protoModule.proto',
            ''
        ].join('\n'),
        'utf8'
    )

    injectCreateRequireShim()
}

// The native accelerator resolver loads optional backends with synchronous
// CJS require(), which does not exist inside an ES module. The same source
// must stay valid for the CJS emit (import.meta is a syntax error there), so
// the shim is prepended to the ESM emit only.
function injectCreateRequireShim() {
    const shimTargets = [path.join(esmDir, 'crypto', 'nativeBackend.js')]
    const banner = [
        "import { createRequire } from 'node:module'",
        'const require = createRequire(import.meta.url)',
        ''
    ].join('\n')

    for (const target of shimTargets) {
        if (!existsSync(target)) {
            throw new Error(`missing createRequire shim target ${target}`)
        }
        const source = readFileSync(target, 'utf8')
        if (!source.includes('createRequire')) {
            writeFileSync(target, banner + source, 'utf8')
        }
    }
}

function listJsFiles(dirPath) {
    const files = []
    const entries = readdirSync(dirPath)

    for (const entry of entries) {
        const absolutePath = path.join(dirPath, entry)
        const stats = statSync(absolutePath)

        if (stats.isDirectory()) {
            files.push(...listJsFiles(absolutePath))
            continue
        }

        if (absolutePath.endsWith('.js')) {
            files.push(absolutePath)
        }
    }

    return files
}

function normalizeEsmSpecifiers(filePath, source) {
    const fromPattern = /(from\s+['"])(\.\.?\/[^'"]+)(['"])/g
    const dynamicImportPattern = /(import\s*\(\s*['"])(\.\.?\/[^'"]+)(['"]\s*\))/g

    return source
        .replace(fromPattern, (_, prefix, specifier, suffix) => {
            return `${prefix}${resolveSpecifier(filePath, specifier)}${suffix}`
        })
        .replace(dynamicImportPattern, (_, prefix, specifier, suffix) => {
            return `${prefix}${resolveSpecifier(filePath, specifier)}${suffix}`
        })
}

function resolveSpecifier(filePath, specifier) {
    const extension = path.extname(specifier)
    const runtimeExtensions = new Set(['.js', '.mjs', '.cjs', '.json', '.node'])

    if (runtimeExtensions.has(extension)) {
        return specifier
    }

    const fileDirectory = path.dirname(filePath)
    const normalized = specifier.replaceAll('/', path.sep)
    const absoluteTarget = path.resolve(fileDirectory, normalized)
    const fileCandidate = `${absoluteTarget}.js`
    const indexCandidate = path.join(absoluteTarget, 'index.js')

    if (existsSync(fileCandidate)) {
        return `${specifier}.js`
    }

    if (existsSync(indexCandidate)) {
        return `${specifier}/index.js`
    }

    const specBridge = resolveSpecBridgeSpecifier(fileDirectory, specifier)
    if (specBridge) {
        return specBridge
    }

    return specifier
}

// The vendored spec lives at <projectRoot>/spec, outside dist. The spec bridges
// (proto/appstate-spec/mex/version-spec) import it via '../spec/<name>', which
// only resolves from dist/ (depth 1); from dist/esm/ (depth 2) it would point at
// the non-existent dist/spec. Repoint such specifiers at the real
// <projectRoot>/spec/<name>/index.js with a correct relative path.
function resolveSpecBridgeSpecifier(fileDirectory, specifier) {
    const match = /^\.\.\/spec\/(.+)$/.exec(specifier)
    if (!match) {
        return null
    }

    const target = path.join(projectRoot, 'spec', match[1], 'index.js')
    if (!existsSync(target)) {
        return null
    }

    const relative = path.relative(fileDirectory, target).replaceAll(path.sep, '/')
    return relative.startsWith('.') ? relative : `./${relative}`
}
