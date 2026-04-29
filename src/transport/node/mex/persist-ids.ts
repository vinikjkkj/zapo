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
    })
}) satisfies Readonly<Record<string, WaMexPersistId>>
