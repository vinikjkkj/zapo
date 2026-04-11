export const WA_BROWSERS = Object.freeze({
    CHROME: 'chrome',
    CHROMIUM: 'chromium',
    FIREFOX: 'firefox',
    SAFARI: 'safari',
    IE: 'ie',
    OPERA: 'opera',
    EDGE: 'edge'
} as const)

// Distinct from proto.DeviceProps.PlatformType: these are the string IDs sent
// as companionPlatformId in the pairing link_code XML stanza, not the proto enum.
export const WA_COMPANION_PLATFORM_IDS = Object.freeze({
    UNKNOWN: '0',
    CHROME: '1',
    EDGE: '2',
    FIREFOX: '3',
    IE: '4',
    OPERA: '5',
    SAFARI: '6',
    ELECTRON: '7',
    UWP: '8',
    OTHER_WEB_CLIENT: '9'
} as const)

const BROWSER_TO_PLATFORM_ID: Record<string, string> = {
    [WA_BROWSERS.CHROME]: WA_COMPANION_PLATFORM_IDS.CHROME,
    [WA_BROWSERS.FIREFOX]: WA_COMPANION_PLATFORM_IDS.FIREFOX,
    [WA_BROWSERS.IE]: WA_COMPANION_PLATFORM_IDS.IE,
    [WA_BROWSERS.OPERA]: WA_COMPANION_PLATFORM_IDS.OPERA,
    [WA_BROWSERS.SAFARI]: WA_COMPANION_PLATFORM_IDS.SAFARI,
    [WA_BROWSERS.EDGE]: WA_COMPANION_PLATFORM_IDS.EDGE
}

const BROWSER_TO_DISPLAY_NAME: Record<string, string> = {
    [WA_BROWSERS.CHROME]: 'Chrome',
    [WA_BROWSERS.CHROMIUM]: 'Chromium',
    [WA_BROWSERS.FIREFOX]: 'Firefox',
    [WA_BROWSERS.IE]: 'IE',
    [WA_BROWSERS.OPERA]: 'Opera',
    [WA_BROWSERS.SAFARI]: 'Safari',
    [WA_BROWSERS.EDGE]: 'Edge'
}

export function getWaCompanionPlatformId(browser: string): string {
    return (
        BROWSER_TO_PLATFORM_ID[browser.trim().toLowerCase()] ??
        WA_COMPANION_PLATFORM_IDS.OTHER_WEB_CLIENT
    )
}

export function getWaBrowserDisplayName(browser: string): string {
    return BROWSER_TO_DISPLAY_NAME[browser.trim().toLowerCase()] ?? browser
}
