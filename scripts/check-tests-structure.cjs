const { readdirSync, statSync } = require('node:fs')
const { join, relative } = require('node:path')

const ROOT_DIR = process.cwd()
const SRC_DIR = join(ROOT_DIR, 'src')
const TESTS_DIR_NAME = '__tests__'

const SOURCE_EXTENSIONS = ['.ts']
const TEST_FILE_SUFFIX = '.test.ts'

const directoriesWithSource = collectDirectoriesWithSource(SRC_DIR)
const missingTestsDirectories = directoriesWithSource.filter(
    (directory) => !hasTestsDirectoryWithTestFiles(directory)
)

if (missingTestsDirectories.length > 0) {
    console.error('[zapo] missing __tests__ coverage for source directories:')
    for (const directory of missingTestsDirectories) {
        console.error(` - ${relative(ROOT_DIR, directory).replaceAll('\\', '/')}`)
    }
    process.exit(1)
}

console.log(
    `[zapo] test structure check passed (${directoriesWithSource.length} source directories validated)`
)

function collectDirectoriesWithSource(rootDirectory) {
    const matches = new Set()
    walkDirectory(rootDirectory, (directory) => {
        if (containsSourceFile(directory)) {
            matches.add(directory)
        }
    })
    return [...matches.values()].sort()
}

function walkDirectory(directory, onDirectory) {
    onDirectory(directory)
    const entries = safeReadDir(directory)
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue
        }
        if (entry.name === TESTS_DIR_NAME) {
            continue
        }
        walkDirectory(join(directory, entry.name), onDirectory)
    }
}

function containsSourceFile(directory) {
    const entries = safeReadDir(directory)
    for (const entry of entries) {
        if (!entry.isFile()) {
            continue
        }
        if (isSourceFile(entry.name)) {
            return true
        }
    }
    return false
}

function hasTestsDirectoryWithTestFiles(directory) {
    const testsDirectory = join(directory, TESTS_DIR_NAME)
    if (!safeIsDirectory(testsDirectory)) {
        return false
    }
    return findAnyTestFile(testsDirectory)
}

function findAnyTestFile(directory) {
    const entries = safeReadDir(directory)
    for (const entry of entries) {
        const absolute = join(directory, entry.name)
        if (entry.isFile() && entry.name.endsWith(TEST_FILE_SUFFIX)) {
            return true
        }
        if (entry.isDirectory() && findAnyTestFile(absolute)) {
            return true
        }
    }
    return false
}

function isSourceFile(fileName) {
    if (fileName.endsWith('.d.ts')) {
        return false
    }
    return SOURCE_EXTENSIONS.some((extension) => fileName.endsWith(extension))
}

function safeReadDir(directory) {
    try {
        return readdirSync(directory, { withFileTypes: true })
    } catch {
        return []
    }
}

function safeIsDirectory(path) {
    try {
        return statSync(path).isDirectory()
    } catch {
        return false
    }
}

