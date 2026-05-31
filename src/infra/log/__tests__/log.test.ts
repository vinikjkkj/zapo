import assert from 'node:assert/strict'
import test from 'node:test'

import { ConsoleLogger } from '@infra/log/ConsoleLogger'
import { createPinoLogger, PinoLogger } from '@infra/log/PinoLogger'
import { createNoopLogger } from '@infra/log/types'

test('console logger honors level gating and exposes level', () => {
    const logger = new ConsoleLogger('warn')
    assert.equal(logger.level, 'warn')

    assert.doesNotThrow(() => {
        logger.trace('trace')
        logger.debug('debug')
        logger.info('info')
        logger.warn('warn')
        logger.error('error')
    })
})

test('pino logger factory creates logger instance with configured level', async () => {
    const logger = await createPinoLogger({
        level: 'debug',
        name: 'zapo-test'
    })

    assert.ok(logger instanceof PinoLogger)
    assert.equal(logger.level, 'debug')

    assert.doesNotThrow(() => {
        logger.debug('test log', { scope: 'infra.log' })
        logger.info('test info')
    })
})

test('pino logger writes bare message for empty context objects', () => {
    const captured: unknown[][] = []
    const fake = {
        level: 'info',
        trace: (...args: unknown[]) => {
            captured.push(args)
        },
        debug: (...args: unknown[]) => {
            captured.push(args)
        },
        info: (...args: unknown[]) => {
            captured.push(args)
        },
        warn: (...args: unknown[]) => {
            captured.push(args)
        },
        error: (...args: unknown[]) => {
            captured.push(args)
        }
    }
    const logger = new PinoLogger(fake, 'info')
    logger.info('hello', {})
    logger.info('world', { scope: 'log' })
    assert.deepEqual(captured[0], ['hello'])
    assert.deepEqual(captured[1], [{ scope: 'log' }, 'world'])
})

test('console logger child bakes bindings into every call and stacks', () => {
    const captured: unknown[][] = []
    const original = console.info
    console.info = ((...args: unknown[]) => {
        captured.push(args)
    }) as typeof console.info
    try {
        const parent = new ConsoleLogger('info')
        const session = parent.child({ session: 'abc' })
        session.info('hello')
        session.info('with extra', { foo: 1 })
        const stacked = session.child({ scope: 'media' })
        stacked.info('nested')
        stacked.info('override', { session: 'xyz' })
        assert.deepEqual(captured[0], ['hello', { session: 'abc' }])
        assert.deepEqual(captured[1], ['with extra', { session: 'abc', foo: 1 }])
        assert.deepEqual(captured[2], ['nested', { session: 'abc', scope: 'media' }])
        assert.deepEqual(captured[3], ['override', { session: 'xyz', scope: 'media' }])
    } finally {
        console.info = original
    }
})

test('pino logger child delegates to underlying child when available', () => {
    const captured: { method: string; args: unknown[] }[] = []
    const fakeChild = {
        level: 'info',
        trace: () => undefined,
        debug: () => undefined,
        info: (...args: unknown[]) => {
            captured.push({ method: 'child.info', args })
        },
        warn: () => undefined,
        error: () => undefined
    }
    const fake = {
        level: 'info',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        child: (bindings: Readonly<Record<string, unknown>>) => {
            captured.push({ method: 'child', args: [bindings] })
            return fakeChild
        }
    }
    const logger = new PinoLogger(fake, 'info')
    const child = logger.child({ session: 'abc' })
    child.info('hello', { extra: 1 })
    assert.deepEqual(captured[0], { method: 'child', args: [{ session: 'abc' }] })
    assert.deepEqual(captured[1], { method: 'child.info', args: [{ extra: 1 }, 'hello'] })
})

test('pino logger child falls back to manual binding when underlying lacks child', () => {
    const captured: unknown[][] = []
    const fake = {
        level: 'info',
        trace: () => undefined,
        debug: () => undefined,
        info: (...args: unknown[]) => {
            captured.push(args)
        },
        warn: () => undefined,
        error: () => undefined
    }
    const logger = new PinoLogger(fake, 'info')
    const child = logger.child({ session: 'abc' })
    child.info('hello')
    child.info('extra', { foo: 1 })
    assert.deepEqual(captured[0], [{ session: 'abc' }, 'hello'])
    assert.deepEqual(captured[1], [{ session: 'abc', foo: 1 }, 'extra'])
})

test('noop logger child returns itself and stays silent', () => {
    const noop = createNoopLogger()
    const child = noop.child({ session: 'x' })
    assert.equal(child, noop)
    assert.doesNotThrow(() => child.info('nothing happens', { whatever: 1 }))
})
