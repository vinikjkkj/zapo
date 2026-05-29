export const WA_BUSINESS_HOURS_DAYS = Object.freeze({
    SUN: 'sun',
    MON: 'mon',
    TUE: 'tue',
    WED: 'wed',
    THU: 'thu',
    FRI: 'fri',
    SAT: 'sat'
} as const)

export type WaBusinessHoursDay =
    (typeof WA_BUSINESS_HOURS_DAYS)[keyof typeof WA_BUSINESS_HOURS_DAYS]

/**
 * Per-day open mode accepted by the `business_profile` edit IQ. A closed day is
 * expressed by omitting it from the config entirely, not by a dedicated mode.
 * `open_time` / `close_time` are only meaningful for `specific_hours`.
 */
export const WA_BUSINESS_HOURS_MODES = Object.freeze({
    OPEN_24H: 'open_24h',
    SPECIFIC_HOURS: 'specific_hours',
    APPOINTMENT_ONLY: 'appointment_only'
} as const)

export type WaBusinessHoursMode =
    (typeof WA_BUSINESS_HOURS_MODES)[keyof typeof WA_BUSINESS_HOURS_MODES]
