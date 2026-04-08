/**
 * Layer 1 — transport primitives.
 *
 * The ONLY place in @zapo-js/fake-server allowed to import from `zapo-js`.
 * Every other layer must reach these primitives via this barrel.
 *
 * See AGENTS.md §3 for the layering rule and the lint firewall that enforces it.
 */

export * from './codec'
export * from './crypto'
export * from './protos'
