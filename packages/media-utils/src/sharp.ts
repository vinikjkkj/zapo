import sharp from 'sharp'
import type {
    WaMediaProcessorImageResult,
    WaMediaProcessorInput,
    WaMediaProcessorStickerThumbnailResult
} from 'zapo-js/media'

const DEFAULT_THUMB_QUALITY = 70

function createPipeline(input: WaMediaProcessorInput): sharp.Sharp {
    if (input instanceof Uint8Array || typeof input === 'string') return sharp(input)
    const pipeline = sharp()
    ;(input as NodeJS.ReadableStream).pipe(pipeline)
    return pipeline
}

export async function generateImageThumbnail(
    input: WaMediaProcessorInput,
    maxEdge: number,
    quality?: number
): Promise<WaMediaProcessorImageResult> {
    const { data, info } = await createPipeline(input)
        .rotate()
        .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: quality ?? DEFAULT_THUMB_QUALITY })
        .toBuffer({ resolveWithObject: true })
    return {
        jpegThumbnail: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        width: info.width,
        height: info.height
    }
}

export async function generateStickerThumbnail(
    input: WaMediaProcessorInput,
    maxEdge: number
): Promise<WaMediaProcessorStickerThumbnailResult> {
    const { data, info } = await createPipeline(input)
        .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer({ resolveWithObject: true })
    return {
        pngThumbnail: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        width: info.width,
        height: info.height
    }
}
