export interface WaMexPersistId {
    readonly docId: string
    readonly clientDocId: string
}

export const WA_MEX_PERSIST_IDS = Object.freeze({
    WWWGetCertificates: Object.freeze({
        docId: '25094190163544446',
        clientDocId: '16428758503015954638431529919'
    }),
    WWWCreateUser: Object.freeze({
        docId: '8548056818544135',
        clientDocId: '25777518041400352865446016972'
    }),
    NewsletterFetch: Object.freeze({
        docId: '35452404184358876',
        clientDocId: '35452404184358876'
    }),
    NewsletterFetchAll: Object.freeze({
        docId: '25399611239711790',
        clientDocId: '25399611239711790'
    }),
    NewsletterDirectorySearch: Object.freeze({
        docId: '26301059626252132',
        clientDocId: '26301059626252132'
    }),
    NewsletterFollowers: Object.freeze({
        docId: '27472091235714801',
        clientDocId: '27472091235714801'
    }),
    NewsletterAdminInfo: Object.freeze({
        docId: '34983385154639574',
        clientDocId: '34983385154639574'
    }),
    NewsletterCreate: Object.freeze({
        docId: '25149874324715067',
        clientDocId: '25149874324715067'
    }),
    NewsletterUpdate: Object.freeze({
        docId: '24250201037901610',
        clientDocId: '24250201037901610'
    }),
    NewsletterDelete: Object.freeze({
        docId: '30062808666639665',
        clientDocId: '30062808666639665'
    }),
    NewsletterJoin: Object.freeze({
        docId: '24404358912487870',
        clientDocId: '24404358912487870'
    }),
    NewsletterLeave: Object.freeze({
        docId: '9767147403369991',
        clientDocId: '9767147403369991'
    }),
    NewsletterUpdateUserSetting: Object.freeze({
        docId: '31938993655691868',
        clientDocId: '31938993655691868'
    }),
    NewsletterChangeOwner: Object.freeze({
        docId: '9546742745432473',
        clientDocId: '9546742745432473'
    }),
    NewsletterDemoteAdmin: Object.freeze({
        docId: '9880997548630971',
        clientDocId: '9880997548630971'
    }),
    NewsletterCreateAdminInvite: Object.freeze({
        docId: '9387141988078609',
        clientDocId: '9387141988078609'
    }),
    NewsletterAcceptAdminInvite: Object.freeze({
        docId: '9580828702035549',
        clientDocId: '9580828702035549'
    }),
    NewsletterRevokeAdminInvite: Object.freeze({
        docId: '9656078347839416',
        clientDocId: '9656078347839416'
    }),
    NewsletterFetchInsights: Object.freeze({
        docId: '9853618868050977',
        clientDocId: '9853618868050977'
    }),
    NewsletterFetchReports: Object.freeze({
        docId: '24241374008893508',
        clientDocId: '24241374008893508'
    }),
    NewsletterFetchPendingInvites: Object.freeze({
        docId: '9783111038412085',
        clientDocId: '9783111038412085'
    }),
    NewsletterFetchRecommended: Object.freeze({
        docId: '25806748772361516',
        clientDocId: '25806748772361516'
    }),
    NewsletterFetchSimilar: Object.freeze({
        docId: '26217043484590756',
        clientDocId: '26217043484590756'
    }),
    NewsletterFetchEnforcements: Object.freeze({
        docId: '25987882310910935',
        clientDocId: '25987882310910935'
    }),
    NewsletterFetchPollVoters: Object.freeze({
        docId: '9407762219322536',
        clientDocId: '9407762219322536'
    }),
    NewsletterFetchMessageReactionSenders: Object.freeze({
        docId: '29575462448733991',
        clientDocId: '29575462448733991'
    }),
    NewsletterFetchAdminCapabilities: Object.freeze({
        docId: '9801384413216421',
        clientDocId: '9801384413216421'
    }),
    NewsletterFetchDirectoryList: Object.freeze({
        docId: '26125047313831973',
        clientDocId: '26125047313831973'
    }),
    NewsletterFetchDirectoryCategoriesPreview: Object.freeze({
        docId: '35266481849605779',
        clientDocId: '35266481849605779'
    }),
    NewsletterFetchIsDomainPreviewable: Object.freeze({
        docId: '9849510985088294',
        clientDocId: '9849510985088294'
    }),
    NewsletterFetchDehydrated: Object.freeze({
        docId: '30328461880085868',
        clientDocId: '30328461880085868'
    }),
    NewsletterLogExposures: Object.freeze({
        docId: '25260800823586918',
        clientDocId: '25260800823586918'
    }),
    CommunityFetchAllSubgroups: Object.freeze({
        docId: '9935467776504344',
        clientDocId: '9935467776504344'
    })
}) satisfies Readonly<Record<string, WaMexPersistId>>
