import { type StickerPackZipEntry } from '@media/sticker-pack'
import type { WaSendStickerPackMessage } from '@message/types'
import type { Proto } from '@proto'

export function validateStickerPackInput(content: WaSendStickerPackMessage): void {
    if (content.stickers.length === 0) {
        throw new Error('sticker pack requires at least one sticker')
    }
    if (!content.trayIcon.fileName) {
        throw new Error('sticker pack trayIcon requires a non-empty fileName')
    }
    if (content.stickers.some((sticker) => sticker.fileName === content.trayIcon.fileName)) {
        throw new Error(
            `sticker pack trayIcon.fileName ${content.trayIcon.fileName} collides with a sticker fileName; the tray icon must be a separate ZIP entry`
        )
    }
}

export function toStickerPackZipEntries(content: WaSendStickerPackMessage): StickerPackZipEntry[] {
    return [
        ...content.stickers.map((sticker) => ({
            fileName: sticker.fileName,
            source: sticker.media
        })),
        { fileName: content.trayIcon.fileName, source: content.trayIcon.media }
    ]
}

export function toStickerPackProtoStickers(
    content: WaSendStickerPackMessage
): Proto.Message.StickerPackMessage.ISticker[] {
    return content.stickers.map((sticker) => ({
        fileName: sticker.fileName,
        emojis: [...sticker.emojis],
        isAnimated: sticker.isAnimated,
        isLottie: sticker.isLottie,
        mimetype: sticker.mimetype ?? 'image/webp'
    }))
}
