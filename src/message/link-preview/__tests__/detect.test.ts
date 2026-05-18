import assert from 'node:assert/strict'
import test from 'node:test'

import { findFirstLink } from '@message/link-preview/detect'

test('findFirstLink picks the first http url', () => {
    const r = findFirstLink('see https://example.com/foo for details')
    assert.equal(r?.matchedText, 'https://example.com/foo')
    assert.equal(r?.url.hostname, 'example.com')
})

test('findFirstLink picks the link at the start of the text', () => {
    const r = findFirstLink('https://example.com')
    assert.equal(r?.matchedText, 'https://example.com')
})

test('findFirstLink strips trailing sentence punctuation', () => {
    const r = findFirstLink('check https://example.com/path.')
    assert.equal(r?.matchedText, 'https://example.com/path')
})

test('findFirstLink strips unbalanced closing paren', () => {
    const r = findFirstLink('(see https://example.com)')
    assert.equal(r?.matchedText, 'https://example.com')
})

test('findFirstLink preserves balanced parens inside url', () => {
    const r = findFirstLink('check https://example.com/a_(b)')
    assert.equal(r?.matchedText, 'https://example.com/a_(b)')
})

test('findFirstLink preserves balanced brackets and braces', () => {
    assert.equal(
        findFirstLink('https://example.com/path[0]')?.matchedText,
        'https://example.com/path[0]'
    )
    assert.equal(
        findFirstLink('https://example.com/{x}/y')?.matchedText,
        'https://example.com/{x}/y'
    )
})

test('findFirstLink returns null when no url present', () => {
    assert.equal(findFirstLink('hello world'), null)
})

test('findFirstLink ignores non http/https schemes', () => {
    assert.equal(findFirstLink('ftp://example.com/file'), null)
    assert.equal(findFirstLink('javascript:alert(1)'), null)
})

test('findFirstLink does not match urls glued to a word boundary', () => {
    assert.equal(findFirstLink('xhttp://example.com'), null)
})

test('findFirstLink picks first when multiple urls in text', () => {
    const r = findFirstLink('a https://one.example b https://two.example')
    assert.equal(r?.matchedText, 'https://one.example')
})
