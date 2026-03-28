const { execSync } = require('node:child_process')
const { join } = require('node:path')

const ROOT_DIR = join(__dirname, '..')
const COMPOSE_FILE = join(ROOT_DIR, 'packages', 'docker-compose.test.yml')

function capture(cmd) {
    return execSync(cmd, { encoding: 'utf8', cwd: ROOT_DIR }).trim()
}

function getPort(service, containerPort) {
    const output = capture(`docker compose -f "${COMPOSE_FILE}" port ${service} ${containerPort}`)
    const match = output.match(/:(\d+)$/)
    if (!match) throw new Error(`Failed to get port for ${service}: ${output}`)
    return match[1]
}

console.log('Starting test containers...')
let failed = false
let started = false
try {
    execSync(`docker compose -f "${COMPOSE_FILE}" up -d --wait`, {
        stdio: 'inherit',
        cwd: ROOT_DIR
    })
    started = true

    const env = {
        ...process.env,
        ZAPO_TEST_MYSQL_HOST: 'localhost',
        ZAPO_TEST_MYSQL_PORT: getPort('mysql', 3306),
        ZAPO_TEST_MYSQL_USER: 'root',
        ZAPO_TEST_MYSQL_PASSWORD: 'test',
        ZAPO_TEST_MYSQL_DATABASE: 'zapo_test',
        ZAPO_TEST_PG_HOST: 'localhost',
        ZAPO_TEST_PG_PORT: getPort('postgres', 5432),
        ZAPO_TEST_PG_USER: 'postgres',
        ZAPO_TEST_PG_PASSWORD: 'test',
        ZAPO_TEST_PG_DATABASE: 'zapo_test',
        ZAPO_TEST_REDIS_HOST: 'localhost',
        ZAPO_TEST_REDIS_PORT: getPort('redis', 6379),
        ZAPO_TEST_MONGO_HOST: 'localhost',
        ZAPO_TEST_MONGO_PORT: getPort('mongo', 27017)
    }

    console.log(
        `Ports: mysql=${env.ZAPO_TEST_MYSQL_PORT} pg=${env.ZAPO_TEST_PG_PORT} redis=${env.ZAPO_TEST_REDIS_PORT} mongo=${env.ZAPO_TEST_MONGO_PORT}`
    )

    console.log('\nRunning package tests...')
    execSync('npx turbo run test --force --continue', { stdio: 'inherit', cwd: ROOT_DIR, env })
} catch {
    failed = true
} finally {
    if (started) {
        console.log('\nStopping test containers...')
        try {
            execSync(`docker compose -f "${COMPOSE_FILE}" down`, {
                stdio: 'inherit',
                cwd: ROOT_DIR
            })
        } catch {
            console.error('Error: failed to stop containers')
            failed = true
        }
    }
}

process.exit(failed ? 1 : 0)
