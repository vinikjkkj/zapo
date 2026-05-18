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

    return specifier
}
