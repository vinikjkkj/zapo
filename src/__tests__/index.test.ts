import assert from 'node:assert/strict'
import test from 'node:test'

import {
    WA_PRIVACY_CATEGORIES,
    WA_PRIVACY_CATEGORY_TO_SETTING,
    WA_PRIVACY_DISALLOWED_LIST_CATEGORIES,
    WA_PRIVACY_SETTING_TO_CATEGORY,
    WA_PRIVACY_TAGS,
    WA_PRIVACY_VALUES
} from '../index'
import type { WaPrivacyCategory, WaPrivacySettingName, WaPrivacyValue } from '../index'

test('root index exports privacy constants and type surfaces', () => {
    const category: WaPrivacyCategory = WA_PRIVACY_CATEGORIES.ABOUT
    const setting: WaPrivacySettingName = WA_PRIVACY_CATEGORY_TO_SETTING[category]
    const value: WaPrivacyValue = WA_PRIVACY_VALUES.CONTACTS

    assert.equal(setting, 'about')
    assert.equal(value, 'contacts')
    assert.equal(WA_PRIVACY_SETTING_TO_CATEGORY.groupAdd, WA_PRIVACY_CATEGORIES.GROUP_ADD)
    assert.equal(WA_PRIVACY_DISALLOWED_LIST_CATEGORIES.ABOUT, WA_PRIVACY_CATEGORIES.ABOUT)
    assert.equal(WA_PRIVACY_TAGS.USER, 'user')
})
