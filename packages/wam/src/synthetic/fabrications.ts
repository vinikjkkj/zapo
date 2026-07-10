import type { WaWamCoordinator } from '../WaWamCoordinator.js'

import { randB64, randHex, randInt, randUuid } from './random.js'

/** Per-session ids the fabrications reuse so their payloads stay internally consistent. */
export interface FabSession {
    readonly unifiedSessionId: string
    readonly appSessionId: string
    readonly gifProvider: 'TENOR' | 'GIPHY'
}

/** One ambient synthetic event: a weighted, optionally capability-gated fabrication grounded in WA Web's real emit. */
export interface AmbientFab {
    readonly event: string
    readonly weight: number
    readonly gate?: 'channels' | 'communities' | 'business'
    readonly emit: (c: WaWamCoordinator, s: FabSession) => void
}

/**
 * The ambient fabrication table. Each entry replicates the field subset WA Web's
 * own emit sets (verified against the deobfuscated bundle), with plausible values.
 * The engine picks one per ambient tick, weighted by cadence; gated entries are
 * only eligible when their capability flag is enabled.
 */
export const AMBIENT_FABS: AmbientFab[] = [
    {
        event: 'AboutConsumptionDaily',
        weight: 1,
        emit: (c) => {
            c.commit('AboutConsumptionDaily', {
                aboutChatConsumptionCount: randInt(0, 4),
                aboutChatBubbleTapCount: randInt(0, 3),
                aboutMessageSendCount: randInt(0, 2)
            })
        }
    },
    {
        event: 'ChannelOpen',
        weight: 1,
        gate: 'channels',
        emit: (c) => {
            c.commit('ChannelOpen', {
                channelSessionId: randInt(0, 1_000_000_000),
                channelEntryPoint: 'UPDATES_TAB',
                channelUserType: 'FOLLOWER',
                cid: `120363${randInt(100_000_000_000, 1_000_000_000_000)}`,
                unreadMessages: randInt(0, 6),
                discoverySurface: 'CHANNEL_UPDATES_HOME'
            })
        }
    },
    {
        event: 'ChatFilterEvent',
        weight: 3,
        emit: (c) => {
            c.commit('ChatFilterEvent', {
                actionType: 'OPEN',
                filterType: 'NONE',
                sessionId: randInt(1, 2_000_000_000),
                targetScreen: 'CHAT_LIST'
            })
        }
    },
    {
        event: 'ChatFolderOpen',
        weight: 3,
        emit: (c) => {
            const hasUnread = Math.random() < 0.4
            c.commit('ChatFolderOpen', {
                folderType: 'Archive',
                ...(hasUnread ? { activityIndicatorCount: randInt(1, 8) } : {})
            })
        }
    },
    {
        event: 'ChatThemeScreen',
        weight: 1,
        emit: (c) => {
            c.commit('ChatThemeScreen', {
                appearanceType: Math.random() < 0.45 ? 'DARK' : 'LIGHT',
                chatThemeChangeApplied: false,
                chatThemeId: '',
                chatThemeSource: 'APP_WIDE',
                chatWallpaperType: 'DEFAULT'
            })
        }
    },
    {
        event: 'ChatThreadWallpaper',
        weight: 3,
        emit: (c) => {
            const isGroup = Math.random() < 0.25
            c.commit('ChatThreadWallpaper', {
                appearanceType: Math.random() < 0.45 ? 'DARK' : 'LIGHT',
                belongsToCommunity: false,
                chatThemeId: 'doodle@whatsapp-green#tonal',
                chatThemeSource: 'APP_WIDE',
                chatType: isGroup ? 'GROUP' : 'INDIVIDUAL',
                threadId: randB64(32),
                wallpaperApplied: false
            })
        }
    },
    {
        event: 'ChatWallpaper',
        weight: 1,
        emit: (c) => {
            c.commit('ChatWallpaper', {
                appearanceType: Math.random() < 0.45 ? 'DARK' : 'LIGHT',
                chatWallpaperChangeApplied: false,
                chatWallpaperSource: 'APP_WIDE',
                chatWallpaperType: 'DEFAULT',
                chatWallpaperVisit: true
            })
        }
    },
    {
        event: 'CommunityCreation',
        weight: 1,
        gate: 'communities',
        emit: (c) => {
            c.commit('CommunityCreation', {
                communityCreationSessionId: randUuid(),
                communityCreationActionTaken: 'ENTER',
                communityCreationCurrentScreen: 'COMMUNITIES_TAB',
                communityCreationEntrypoint: 'COMMUNITIES_TAB'
            })
        }
    },
    {
        event: 'CommunityFeatureUsage',
        weight: 1,
        gate: 'communities',
        emit: (c) => {
            c.commit('CommunityFeatureUsage', {
                communityId: `120363${randInt(100_000_000_000, 1_000_000_000_000)}`,
                communityUiAction: 'ENTRY',
                communityUiFeature: 'SUBGROUP_SWITCH'
            })
        }
    },
    {
        event: 'CommunityHomeAction',
        weight: 1,
        gate: 'communities',
        emit: (c) => {
            c.commit('CommunityHomeAction', {
                communityHomeId: `120363${randInt(100_000_000_000, 1_000_000_000_000)}`,
                communityHomeViews: randInt(1, 4),
                communityHomeGroupNavigations: randInt(0, 3),
                communityHomeGroupDiscoveries: randInt(0, 2),
                communityHomeGroupJoins: 0
            })
        }
    },
    {
        event: 'CommunityTabAction',
        weight: 1,
        gate: 'communities',
        emit: (c) => {
            c.commit('CommunityTabAction', {
                communityTabViews: randInt(1, 4),
                communityTabGroupNavigations: randInt(0, 2),
                communityTabToHomeViews: randInt(0, 2),
                communityTabViewsViaContextMenu: 0
            })
        }
    },
    {
        event: 'ContactNotificationSettingUserJourney',
        weight: 1,
        emit: (c, s) => {
            c.commit('ContactNotificationSettingUserJourney', {
                appSessionId: s.appSessionId,
                contactNotificationSettingActionType:
                    Math.random() < 0.7 ? 'MUTE_MENTION_EVERYONE_ON' : 'MUTE_MENTION_EVERYONE_OFF',
                uiSurface: 'CONTACT_NOTIFICATION_SETTING_PAGE',
                groupSize: randInt(3, 60)
            })
        }
    },
    {
        event: 'DialogEvent',
        weight: 1,
        emit: (c) => {
            if (Math.random() < 0.6) {
                c.commit('DialogEvent', {
                    dialogEventSource: 'dismiss',
                    dialogEventType: 'CLICK',
                    dialogName: 'HARD_REFRESH'
                })
            } else {
                c.commit('DialogEvent', {
                    dialogEventSource: 'cancel',
                    dialogEventType: 'CLICK',
                    dialogName: 'LOGOUT'
                })
            }
        }
    },
    {
        event: 'DisappearingMessageChatPicker',
        weight: 1,
        emit: (c) => {
            c.commit('DisappearingMessageChatPicker', {
                dmChatPickerEntryPoint: 'DEFAULT_MODE_SETTING',
                dmChatPickerEventName: 'CHAT_PICKER_TRAY_OPEN',
                ephemeralityDuration: Math.random() < 0.8 ? 7_776_000 : 604_800
            })
        }
    },
    {
        event: 'ForwardActionUserJourney',
        weight: 1,
        emit: (c, s) => {
            const isGroup = Math.random() < 0.35
            c.commit('ForwardActionUserJourney', {
                appSessionId: s.appSessionId,
                unifiedSessionId: s.unifiedSessionId,
                userJourneyFunnelId: randUuid(),
                forwardUserJourneyFunnelId: randUuid(),
                forwardActionUserJourneyAction: 'CONTEXT_MENU_SHOWN_WITHOUT_FORWARD',
                uiSurface: isGroup ? 'GROUP_CHAT' : 'CHAT_THREAD',
                userJourneyChatType: isGroup ? 'GROUP' : 'INDIVIDUAL',
                messageType: isGroup ? 'GROUP' : 'INDIVIDUAL',
                messageMediaType: 'TEXT',
                messageIsFromMe: false
            })
        }
    },
    {
        event: 'GroupJourney',
        weight: 1,
        gate: 'communities',
        emit: (c, s) => {
            c.commit('GroupJourney', {
                actionType: 'GROUP_NAVIGATION',
                appSessionId: s.appSessionId,
                surface: 'COMMUNITY_TAB',
                groupSize: randInt(6, 180),
                threadType: 'SUB_GROUP',
                userRole: 'MEMBER'
            })
        }
    },
    {
        event: 'GroupMemberUpdates',
        weight: 3,
        emit: (c) => {
            const groupMemberUpdatesSessionId = randUuid()
            c.commit('GroupMemberUpdates', {
                groupMemberUpdatesActionName: 'VIEW',
                groupMemberUpdatesCurrentScreen: 'GROUP_MEMBER_UPDATES_SCREEN',
                groupMemberUpdatesSessionId
            })
            c.commit('GroupMemberUpdates', {
                groupMemberUpdatesActionName: 'FETCH_MEMBER_UPDATES_SUCCESS',
                groupMemberUpdatesCurrentScreen: 'GROUP_MEMBER_UPDATES_SCREEN',
                groupMemberUpdatesSessionId,
                fetchedMessageCount: randInt(1, 8),
                fetchedMessageLatency: randInt(40, 400)
            })
        }
    },
    {
        event: 'HfmTextSearchComplete',
        weight: 1,
        emit: (c) => {
            c.commit('HfmTextSearchComplete', {})
        }
    },
    {
        event: 'KeepInChatErrors',
        weight: 1,
        emit: (c) => {
            const isAGroup = Math.random() < 0.35
            const isAdmin = isAGroup && Math.random() < 0.5
            c.commit('KeepInChatErrors', {
                kicAction: 'KEEP_MESSAGE',
                isAGroup,
                isAdmin,
                canEditDmSettings: isAGroup ? isAdmin : true,
                kicMessageEphemeralityDuration: 604_800,
                kicErrorCode: 'OFFLINE'
            })
        }
    },
    {
        event: 'KeepInChatNux',
        weight: 1,
        emit: (c) => {
            const durations = [86_400, 604_800, 7_776_000]
            c.commit('KeepInChatNux', {
                kicNuxActionName: 'KIC_NUX_IMPRESSION',
                trigger: 'CHAT_ENTRY',
                chatEphemeralityDuration: durations[randInt(0, durations.length)]
            })
        }
    },
    {
        event: 'LimitSharingSettingUpdate',
        weight: 1,
        emit: (c) => {
            c.commit('LimitSharingSettingUpdate', {
                toggleUpdateAction: Math.random() < 0.7 ? 'TURN_ON' : 'TURN_OFF'
            })
        }
    },
    {
        event: 'ListUpdateUserJourney',
        weight: 3,
        emit: (c) => {
            c.commit('ListUpdateUserJourney', {
                listAction: 'CREATE',
                listUpdateUserJourneyAction: 'START',
                updateEntryPoint: 'ADD_LIST_FILTER'
            })
        }
    },
    {
        event: 'LockFolderUnlock',
        weight: 1,
        emit: (c) => {
            c.commit('LockFolderUnlock', {
                landingSurface: 'FOLDER',
                totalChatCount: randInt(1, 4),
                unlockEntryPoint: 'CHAT_LIST'
            })
        }
    },
    {
        event: 'MdChatAssignmentSecondaryAction',
        weight: 1,
        gate: 'business',
        emit: (c) => {
            c.commit('MdChatAssignmentSecondaryAction', {
                mdChatAssignmentSecondaryActionAgentId: '',
                mdChatAssignmentSecondaryActionBrowserId: randHex(20),
                mdChatAssignmentSecondaryActionChatType: 'INDIVIDUAL',
                mdChatAssignmentSecondaryActionMdId: randInt(0, 30),
                mdChatAssignmentSecondaryActionSource: 'NONE',
                mdChatAssignmentSecondaryActionType: 'ACTION_TOOLTIP_SHOWN'
            })
        }
    },
    {
        event: 'MediaHubUserJourney',
        weight: 1,
        emit: (c, s) => {
            const mediaHubSessionId = randUuid()
            c.commit('MediaHubUserJourney', {
                mediaHubEntryPoint: 'MAIN_SCREEN',
                mediaHubAction: 'OPEN_MEDIA_HUB',
                unifiedSessionId: s.unifiedSessionId,
                mediaHubSurface: 'MEDIA',
                mediaHubSequenceNumber: 1,
                mediaHubSessionId,
                customFields: JSON.stringify({ search_results: false })
            })
        }
    },
    {
        event: 'MessagingUserJourney',
        weight: 1,
        emit: (c, s) => {
            c.commit('MessagingUserJourney', {
                appSessionId: s.appSessionId,
                userJourneyFunnelId: randHex(16),
                threadType: 'INDIVIDUAL',
                uiSurface: 'MESSAGE_MENU',
                messagingActionType: 'CLICK_PIN',
                mediaType: 'TEXT'
            })
        }
    },
    {
        event: 'PinInChatInteraction',
        weight: 1,
        emit: (c) => {
            c.commit('PinInChatInteraction', {
                pinInChatInteractionType: 'TAP_ON_BANNER',
                isAGroup: false,
                mediaType: 'TEXT',
                pinCount: 1,
                pinIndex: 0,
                isSelfPin: Math.random() < 0.5
            })
        }
    },
    {
        event: 'PrivacyHighlightDaily',
        weight: 1,
        emit: (c) => {
            c.commit('PrivacyHighlightDaily', {
                privacyHighlightCategory: 'E2EE',
                privacyHighlightSurface: 'GOLDEN_BOX_CONTACT',
                narrativeAppearCount: randInt(1, 8),
                dialogAppearCount: 0,
                dialogSelectCount: 0
            })
        }
    },
    {
        event: 'PrivacySettingsClick',
        weight: 1,
        emit: (c) => {
            const items = [
                'LAST_SEEN_AND_ONLINE',
                'PROFILE_PHOTO',
                'ABOUT',
                'GROUPS',
                'READ_RECEIPT',
                'BLOCKED'
            ] as const
            c.commit('PrivacySettingsClick', {
                privacyControlEntryPoint: 'PRIVACY_SETTINGS',
                privacyControlItem: items[randInt(0, items.length)]
            })
        }
    },
    {
        event: 'PrivacyTipAction',
        weight: 1,
        emit: (c) => {
            c.commit('PrivacyTipAction', {
                privacyTipActionType: Math.random() < 0.8 ? 'VIEW' : 'CLICK_OK'
            })
        }
    },
    {
        event: 'QuotedMessageUserJourney',
        weight: 1,
        emit: (c, s) => {
            const funnelId = randUuid()
            c.commit('QuotedMessageUserJourney', {
                appSessionId: s.appSessionId,
                unifiedSessionId: s.unifiedSessionId,
                userJourneyFunnelId: funnelId,
                uiSurface: 'CHAT_THREAD',
                userJourneyChatType: 'INDIVIDUAL',
                quotedMediaType: 'TEXT',
                quotedMessageTypeEnum: 'INDIVIDUAL',
                quotedMessageUserJourneyAction: 'QUOTED_MESSAGE_ADDED',
                quotedMessageUserJourneyEntryPoint: 'CONTEXT_MENU_REPLY_BUTTON'
            })
        }
    },
    {
        event: 'ReactionUserJourney',
        weight: 3,
        emit: (c, s) => {
            c.commit('ReactionUserJourney', {
                appSessionId: s.appSessionId,
                unifiedSessionId: s.unifiedSessionId,
                userJourneyFunnelId: randUuid(),
                userJourneyEventMs: Date.now(),
                reactionUserJourneyAction: 'TRAY_OPEN',
                reactionUserJourneyEntryPoint: 'MACOS_MESSAGE_REACTION_BUTTON',
                uiSurface: 'CHAT_THREAD',
                userJourneyChatType: 'INDIVIDUAL',
                messageType: 'INDIVIDUAL',
                messageMediaType: 'TEXT',
                messageHasReaction: false,
                messageHasOwnReaction: false
            })
        }
    },
    {
        event: 'ReportToAdminEvents',
        weight: 1,
        emit: (c) => {
            c.commit('ReportToAdminEvents', {
                reportToAdminInteraction: 'CLICK_SEND_FOR_ADMIN_REVIEW',
                rtaGroupId: `120363${randInt(100_000_000_000, 999_999_999_999)}@g.us`
            })
        }
    },
    {
        event: 'RingtoneScreen',
        weight: 1,
        emit: (c) => {
            c.commit('RingtoneScreen', {
                ringtoneChangeApplied: false,
                ringtoneId: '__default__',
                ringtoneReset: false,
                ringtoneSelectionCancelled: true,
                ringtoneSource: 'APP_WIDE',
                premiumRingtonesDownloadedCount: randInt(0, 5)
            })
        }
    },
    {
        event: 'ScreenLockSettingsData',
        weight: 1,
        emit: (c) => {
            c.commit('ScreenLockSettingsData', {})
        }
    },
    {
        event: 'SearchActionEvent',
        weight: 3,
        emit: (c) => {
            c.commit('SearchActionEvent', {
                searchAction: 'TYPEAHEAD_SHOW',
                searchActionEntryPoint: 'CHATS_LIST',
                searchAiSuggestionCount: randInt(0, 2),
                searchChatsCount: randInt(1, 6),
                searchContactsCount: randInt(0, 4),
                searchGroupsCount: randInt(0, 3),
                searchMessagesCount: randInt(0, 5)
            })
        }
    },
    {
        event: 'SearchTheWebFunnel',
        weight: 1,
        emit: (c) => {
            c.commit('SearchTheWebFunnel', {
                stwInteraction: 'ENTRY_POINT_SURFACED',
                stwEntryPoint: 'HIGHLY_FORWARDED_MESSAGE',
                stwFormat: 'SINGLE_TEXT',
                messageType: 'GROUP'
            })
        }
    },
    {
        event: 'SettingsChange',
        weight: 1,
        emit: (c) => {
            const toggles = [
                'IS_ENTER_TO_SEND_ENABLED',
                'IS_SPELL_CHECK_ENABLED',
                'DISABLE_LINK_PREVIEWS',
                'REPLACE_TEXT_WITH_EMOJI'
            ] as const
            c.commit('SettingsChange', {
                settingType: toggles[randInt(0, toggles.length)],
                currentSettingValue: Math.random() < 0.5 ? 'true' : 'false'
            })
        }
    },
    {
        event: 'SettingsClick',
        weight: 3,
        emit: (c) => {
            const items = [
                'CHATS',
                'NOTIFICATIONS',
                'PRIVACY',
                'ACCOUNT',
                'STARRED_MESSAGES'
            ] as const
            c.commit('SettingsClick', {
                settingsItem: items[randInt(0, items.length)],
                settingsClickEntryPoint: 'SETTINGS_SCREEN'
            })
        }
    },
    {
        event: 'SettingsSearchInitiate',
        weight: 1,
        emit: (c) => {
            c.commit('SettingsSearchInitiate', {
                settingsPageType: 'SETTINGS'
            })
        }
    },
    {
        event: 'SettingsSearchTap',
        weight: 1,
        emit: (c) => {
            c.commit('SettingsSearchTap', {
                tapItemName: 'chat-wallpaper',
                topLevelParentSetting: 'CHATS'
            })
        }
    },
    {
        event: 'ShareContentUserJourney',
        weight: 1,
        emit: (c, s) => {
            c.commit('ShareContentUserJourney', {
                appSessionId: s.appSessionId,
                unifiedSessionId: s.unifiedSessionId,
                userJourneyFunnelId: randUuid(),
                userJourneyEventMs: Date.now(),
                shareContentUserJourneyAction: 'FUNNEL_START',
                shareContentUserJourneyEntryPoint: 'CONTEXT_MENU',
                uiSurface: 'CHAT_THREAD',
                mediaCount: 0,
                hasFiles: false
            })
        }
    },
    {
        event: 'SnackbarDeleteUndo',
        weight: 1,
        emit: (c) => {
            c.commit('SnackbarDeleteUndo', {
                snackbarActionType: 'SNACKBAR_SHOWN',
                isAGroup: false,
                messagesUndeleted: 1,
                threadId: randB64(32),
                mediaType: 'TEXT'
            })
        }
    },
    {
        event: 'StatusItemView',
        weight: 3,
        emit: (c) => {
            const viewTime = randInt(2500, 8000)
            c.commit('StatusItemView', {
                statusItemViewResult: 'OK',
                statusItemViewTime: viewTime,
                statusItemLoadTime: randInt(40, 600),
                statusItem3sViewCount: viewTime >= 3000 ? 1 : 0,
                statusItemViewCount: 1,
                statusItemImpressionCount: 1,
                statusItemReplied: 0,
                statusCategory: 'REGULAR_STATUS',
                statusViewerSessionId: randInt(1, 1_000_000_000),
                statusRowSection: 'RECENT_STORIES',
                statusRowIndex: randInt(0, 5),
                mediaType: 'PHOTO',
                statusItemUnread: true
            })
        }
    },
    {
        event: 'StatusPosterActions',
        weight: 1,
        emit: (c) => {
            c.commit('StatusPosterActions', {
                statusEventType: 'STATUS_ENTRYPOINT_TAP',
                statusCreationEntryPoint:
                    Math.random() < 0.5 ? 'STATUS_TAB_CAMERA' : 'STATUS_TAB_PEN',
                statusPostingSessionId: randInt(1, 2_000_000_000)
            })
        }
    },
    {
        event: 'StatusPostImpression',
        weight: 1,
        emit: (c, s) => {
            const viewTime = randInt(2500, 8000)
            c.commit('StatusPostImpression', {
                statusId: randHex(20),
                statusContentType: 'PHOTO',
                statusMediaType: 'PHOTO',
                isSelfView: false,
                isSubImpression: false,
                statusViewEntrypoint: 'CHAT_LIST',
                statusViewTime: viewTime,
                unifiedSessionId: s.unifiedSessionId,
                updatesTabSessionId: randInt(1, 1_000_000_000),
                statusViewerSessionId: randInt(1, 1_000_000_000),
                statusPogIndex: 0,
                statusPostIndex: 0,
                isFirstView: true,
                isCloseSharingPost: false,
                isPosterBiz: false,
                isViewedInLandscape: false,
                psaLinkAvailable: false,
                statusCategory: 'REGULAR_STATUS',
                statusPostPlaybackDuration: viewTime,
                statusContainsMusic: false,
                musicBlocked: false,
                statusContainsQuestion: false,
                isSuccessfulView: true,
                statusItemViewResult: 'OK',
                entryMethod: 'DIRECT_POG_TAP',
                viewSequenceIndex: 0,
                isResharable: false,
                isReshare: false
            })
        }
    },
    {
        event: 'StatusReportingEvents',
        weight: 1,
        emit: (c) => {
            c.commit('StatusReportingEvents', {
                statusReportInteraction: 'CLICK_REPORT'
            })
        }
    },
    {
        event: 'StatusRowView',
        weight: 3,
        emit: (c) => {
            c.commit('StatusRowView', {
                statusRowEntryMethod: 'DIRECT_ROW_TAP',
                statusRowIndex: randInt(0, 5),
                statusRowSection: 'RECENT_STORIES',
                statusRowUnreadItemCount: randInt(1, 4),
                statusRowViewCount: 1,
                statusSessionId: randInt(1, 1_000_000_000),
                statusViewerSessionId: randInt(1, 1_000_000_000)
            })
        }
    },
    {
        event: 'StatusViewerAction',
        weight: 1,
        emit: (c) => {
            c.commit('StatusViewerAction', {
                viewerActionType: 'ATTRIBUTION_TAPPED',
                attributionType: 'MUSIC',
                statusCategory: 'REGULAR_STATUS'
            })
        }
    },
    {
        event: 'StickerAddToFavorite',
        weight: 1,
        emit: (c) => {
            c.commit('StickerAddToFavorite', {
                stickerIsAnimated: Math.random() < 0.5,
                stickerIsFirstParty: false,
                stickerIsFromStickerMaker: false,
                stickerIsPremium: false
            })
        }
    },
    {
        event: 'StickerStoreOpened',
        weight: 1,
        emit: (c) => {
            c.commit('StickerStoreOpened', {})
        }
    },
    {
        event: 'SystemMessageClick',
        weight: 1,
        emit: (c) => {
            c.commit('SystemMessageClick', {
                isAGroup: false,
                isANewThread: true,
                systemMessageCategory: 'PRIVACY',
                systemMessageType: 'E2E_ENCRYPTED_MESSAGES'
            })
        }
    },
    {
        event: 'UiMessageYourselfAction',
        weight: 1,
        emit: (c) => {
            const useSearch = Math.random() < 0.4
            const uiMessageYourselfFunnelName = useSearch ? 'CONTACT_AND_GLOBAL_SEARCH' : 'NEW_CHAT'
            const uiMessageYourselfActionType =
                Math.random() < 0.5
                    ? useSearch
                        ? 'SEARCH_BAR_PRESSED'
                        : 'NEW_CHAT_PRESSED'
                    : 'EXISTING_NTS_OPENED'
            c.commit('UiMessageYourselfAction', {
                uiMessageYourselfActionSessionId: randHex(16),
                uiMessageYourselfActionType,
                uiMessageYourselfFunnelName
            })
        }
    },
    {
        event: 'UiRevokeAction',
        weight: 1,
        emit: (c) => {
            const trash = Math.random() < 0.45
            c.commit('UiRevokeAction', {
                messageAction: trash ? 'TRASH_CAN_SELECTED' : 'MESSAGE_SELECTED',
                uiRevokeActionDuration: trash ? randInt(600, 5000) : 0,
                uiRevokeActionSessionId: randHex(16)
            })
        }
    },
    {
        event: 'UpdatesTabSearch',
        weight: 1,
        emit: (c) => {
            c.commit('UpdatesTabSearch', {
                updateTabSearchEventType: 'SEARCH_TAP',
                channelsFollowedCount: randInt(0, 5),
                channelsAdminCount: 0
            })
        }
    },
    {
        event: 'UsernameExposed',
        weight: 1,
        emit: (c) => {
            c.commit('UsernameExposed', {
                usernameExposureContext: 'contact_info_subtitle'
            })
        }
    },
    {
        event: 'ViewBusinessProfile',
        weight: 1,
        emit: (c) => {
            const entryPoints = ['CHAT_HEADER', 'CONTACT_CARD', 'CHATS_HOME'] as const
            c.commit('ViewBusinessProfile', {
                viewBusinessProfileAction: 'ACTION_IMPRESSION',
                catalogSessionId: randHex(16),
                profileEntryPoint: entryPoints[randInt(0, entryPoints.length)],
                isProfileLinked: false,
                hasCoverPhoto: Math.random() < 0.5
            })
        }
    },
    {
        event: 'ViewOnceScreenshotActions',
        weight: 1,
        emit: (c) => {
            c.commit('ViewOnceScreenshotActions', {
                voSsAction: 'PLACEHOLDER_MESSAGE_LEARN_MORE_TAP',
                voMessageType: Math.random() < 0.75 ? 'PHOTO' : 'VIDEO',
                isAGroup: false,
                threadId: randB64(32)
            })
        }
    },
    {
        event: 'WaShopsManagement',
        weight: 1,
        gate: 'business',
        emit: (c) => {
            c.commit('WaShopsManagement', {
                shopsManagementAction: 'ACTION_CLICK_SHOPS_SETTING',
                isShopsProductPreviewVisible: false
            })
        }
    },
    {
        event: 'WebcButterbarEvent',
        weight: 3,
        emit: (c) => {
            const offline = Math.random() < 0.6
            c.commit('WebcButterbarEvent', {
                webcButterbarType: offline ? 'OFFLINE' : 'RESUME_CONNECTING',
                webcButterbarAction: Math.random() < 0.7 ? 'IMPRESSION' : 'AUTO_DISMISS'
            })
        }
    },
    {
        event: 'WebcLinkPreviewDisplay',
        weight: 1,
        emit: (c) => {
            c.commit('WebcLinkPreviewDisplay', {
                webcDisplayStatus: 'SHOWED_PREVIEW_TO_USER',
                didRequestHq: true,
                didRespondHqPreview: true,
                didFallbackNonHq: false
            })
        }
    },
    {
        event: 'WebcMenu',
        weight: 1,
        emit: (c) => {
            const labels = ['NEW_GROUP', 'STARRED', 'ARCHIVED', 'NEW_GROUP', 'STARRED'] as const
            c.commit('WebcMenu', {
                webcMenuAction: 'THREADS_SCREEN_CLICK',
                webcMenuItemLabel: labels[randInt(0, labels.length)]
            })
        }
    },
    {
        event: 'WebcNativeUpsellCta',
        weight: 1,
        emit: (c) => {
            const sources = ['CHATLIST_DROPDOWN', 'SETTINGS', 'BUTTERBAR'] as const
            c.commit('WebcNativeUpsellCta', {
                webcNativeUpsellCtaEventType: 'IMPRESSION',
                webcNativeUpsellCtaSource: sources[randInt(0, sources.length)],
                webcNativeUpsellCtaQrScreenExperimentGroup: 'CONTROL',
                webcNativeUpsellCtaReleaseChannel: 'PRODUCTION',
                webcNativeUpsellCtaIsBetaUser: false
            })
        }
    },
    {
        event: 'WebcNavbar',
        weight: 3,
        emit: (c) => {
            const r = Math.random()
            const webcNavbarItemLabel =
                r < 0.7 ? 'CHATS' : r < 0.85 ? 'STATUS' : r < 0.95 ? 'SETTINGS' : 'COMMUNITIES'
            c.commit('WebcNavbar', { webcNavbarItemLabel })
        }
    },
    {
        event: 'WebContactListStartNewChat',
        weight: 3,
        emit: (c) => {
            const isGroup = Math.random() < 0.15
            c.commit('WebContactListStartNewChat', {
                webContactListStartNewChatType: isGroup ? 'GROUP' : 'CONTACT',
                webContactListStartNewChatSearch: isGroup ? true : Math.random() < 0.55
            })
        }
    },
    {
        event: 'WebcStickerMakerEvents',
        weight: 1,
        emit: (c) => {
            c.commit('WebcStickerMakerEvents', {
                stickerMakerEventName: 'STICKER_MAKER_BUTTON_TAP'
            })
        }
    },
    {
        event: 'WebcWhatsNewImpression',
        weight: 1,
        emit: (c) => {
            c.commit('WebcWhatsNewImpression', {
                webcWhatsNewSurface: 'BANNER',
                webcWhatsNewAction: 'IMPRESSION',
                webcWhatsNewVariant: randInt(1, 6)
            })
        }
    }
]
