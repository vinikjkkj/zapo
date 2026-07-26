/**
 * Layer 1 – credential/store type wrapper.
 *
 * Re-exports the auth and store types from zapo-js so the fixture layer can
 * seed a registered session without importing zapo-js directly.
 */

export type { WaAuthCredentials, WaMobileTransportDeviceInfo } from 'zapo-js/auth'
export type { WaStore } from 'zapo-js/store'
