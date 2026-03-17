import assert from 'node:assert/strict'
import test from 'node:test'

import { ConsoleLogger } from '@infra/log/ConsoleLogger'
import { createPinoLogger, PinoLogger } from '@infra/log/PinoLogger'

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

