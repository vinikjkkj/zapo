const MIN_NODE_VERSION = Object.freeze({
    major: 20,
    minor: 9,
    patch: 0
})

const currentVersion = parseNodeVersion(process.versions.node)

if (!currentVersion) {
    console.error('[zapo] failed to parse current node version')
    process.exit(1)
}

if (compareVersions(currentVersion, MIN_NODE_VERSION) < 0) {
    console.error(
        `[zapo] unsupported node version ${formatVersion(currentVersion)}. minimum required is ${formatVersion(MIN_NODE_VERSION)}`
    )
    process.exit(1)
}

function parseNodeVersion(version) {
    if (typeof version !== 'string') {
        return null
    }

    const match = /^v?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/.exec(version.trim())
    const groups = match?.groups

    if (!groups) {
        return null
    }

    return {
        major: Number(groups.major),
        minor: Number(groups.minor),
        patch: Number(groups.patch)
    }
}

function compareVersions(left, right) {
    if (left.major !== right.major) {
        return left.major - right.major
    }

    if (left.minor !== right.minor) {
        return left.minor - right.minor
    }

    return left.patch - right.patch
}

function formatVersion(version) {
    return `${version.major}.${version.minor}.${version.patch}`
}

