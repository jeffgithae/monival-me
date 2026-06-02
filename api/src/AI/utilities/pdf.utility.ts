import * as pako from 'pako';
import { PNG } from 'pngjs';
import { PDFDocument, PDFName, PDFRawStream, PDFRef } from 'pdf-lib';

enum PngColorTypes {
    Grayscale = 0,
    Rgb = 2,
    RgbAlpha = 4,
    GrayscaleAlpha = 6,
}

const ComponentsPerPixelOfColorType = {
    [PngColorTypes.Rgb]: 3,
    [PngColorTypes.Grayscale]: 1,
    [PngColorTypes.RgbAlpha]: 4,
    [PngColorTypes.GrayscaleAlpha]: 2,
} as const;

const readBitAtOffsetOfByte = (byte: number, bitOffset: number) => {
    return (byte >> bitOffset) & 1;
};

const readBitAtOffsetOfArray = (uint8Array: Uint8Array, bitOffsetWithinArray: number) => {
    const byteOffset = Math.floor(bitOffsetWithinArray / 8);
    const byte = uint8Array[uint8Array.length - byteOffset];
    const bitOffsetWithinByte = Math.floor(bitOffsetWithinArray % 8);
    return readBitAtOffsetOfByte(byte, bitOffsetWithinByte);
};

interface ImageData {
    ref: PDFRef;
    smaskRef?: PDFRef;
    colorSpace: PDFName;
    name: string;
    width: number;
    height: number;
    bitsPerComponent: number;
    data: Uint8Array;
    type: 'jpg' | 'png';
    isAlphaLayer?: boolean;
    alphaLayer?: ImageData;
}

const savePng = (image: ImageData): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const isGrayscale = image.colorSpace.toString() === '/DeviceGray';
        const colorPixels = pako.inflate(image.data);
        const alphaPixels = image.alphaLayer ? pako.inflate(image.alphaLayer.data) : undefined;

        const colorType = isGrayscale && alphaPixels ? PngColorTypes.GrayscaleAlpha : !isGrayscale && alphaPixels ? PngColorTypes.RgbAlpha : isGrayscale ? PngColorTypes.Grayscale : PngColorTypes.Rgb;

        const colorByteSize = 1;
        const width = image.width * colorByteSize;
        const height = image.height * colorByteSize;
        const inputHasAlpha = [PngColorTypes.RgbAlpha, PngColorTypes.GrayscaleAlpha].includes(colorType);

        const png = new PNG({
            width,
            height,
            colorType,
            inputColorType: colorType,
            inputHasAlpha,
        });

        const componentsPerPixel = ComponentsPerPixelOfColorType[colorType];
        png.data = new Uint8Array(width * height * componentsPerPixel);

        let colorPixelIdx = 0;
        let pixelIdx = 0;

        while (pixelIdx < png.data.length) {
            if (colorType === PngColorTypes.Rgb) {
                png.data[pixelIdx++] = colorPixels[colorPixelIdx++];
                png.data[pixelIdx++] = colorPixels[colorPixelIdx++];
                png.data[pixelIdx++] = colorPixels[colorPixelIdx++];
            } else if (colorType === PngColorTypes.RgbAlpha) {
                png.data[pixelIdx++] = colorPixels[colorPixelIdx++];
                png.data[pixelIdx++] = colorPixels[colorPixelIdx++];
                png.data[pixelIdx++] = colorPixels[colorPixelIdx++];
                png.data[pixelIdx++] = alphaPixels![colorPixelIdx - 1];
            } else if (colorType === PngColorTypes.Grayscale) {
                const bit = readBitAtOffsetOfArray(colorPixels, colorPixelIdx++) === 0 ? 0x00 : 0xff;
                png.data[png.data.length - pixelIdx++] = bit;
            } else if (colorType === PngColorTypes.GrayscaleAlpha) {
                const bit = readBitAtOffsetOfArray(colorPixels, colorPixelIdx++) === 0 ? 0x00 : 0xff;
                png.data[png.data.length - pixelIdx++] = bit;
                png.data[png.data.length - pixelIdx++] = alphaPixels![colorPixelIdx - 1];
            } else {
                throw new Error(`Unknown colorType=${colorType}`);
            }
        }

        const buffer: number[] = [];
        png.pack()
            .on('data', (data) => buffer.push(...data))
            .on('end', () => resolve(Buffer.from(buffer)))
            .on('error', (err) => reject(err));
    });

export const getImageFromPdf = async (inputBuffer: Buffer): Promise<Buffer[]> => {
    try {
        const imagesInDoc: ImageData[] = [];
        const imageBuffers: Buffer[] = [];

        // Load the PDF document using the new API
        const pdfDoc = await PDFDocument.load(inputBuffer);

        let objectIdx = 0;
        // Iterate through all objects in the PDF
        for (const [ref, obj] of pdfDoc.context.enumerateIndirectObjects()) {
            objectIdx += 1;

            // Check if the object is a stream
            if (!(obj instanceof PDFRawStream)) continue;

            const dict = obj.dict;

            // Get dictionary entries using the new API
            const smaskRef = dict.get(PDFName.of('SMask')) as PDFRef;
            const colorSpace = dict.get(PDFName.of('ColorSpace')) as PDFName;
            const subtype = dict.get(PDFName.of('Subtype')) as PDFName;
            const width = dict.get(PDFName.of('Width')) as unknown as number;
            const height = dict.get(PDFName.of('Height')) as unknown as number;
            const name = dict.get(PDFName.of('Name')) as PDFName;
            const bitsPerComponent = dict.get(PDFName.of('BitsPerComponent')) as unknown as number;
            const filter = dict.get(PDFName.of('Filter')) as PDFName;

            if (subtype?.toString() === '/Image') {
                imagesInDoc.push({
                    ref,
                    smaskRef,
                    colorSpace,
                    name: name ? name.toString().slice(1) : `Object${objectIdx}`,
                    width,
                    height,
                    bitsPerComponent,
                    data: obj.contents,
                    type: filter?.toString() === '/DCTDecode' ? 'jpg' : 'png',
                });
            }
        }

        // Link alpha layers
        imagesInDoc.forEach((image) => {
            if (image.type === 'png' && image.smaskRef) {
                const smaskImg = imagesInDoc.find(({ ref }) => ref === image.smaskRef);
                if (smaskImg) {
                    smaskImg.isAlphaLayer = true;
                    image.alphaLayer = smaskImg;
                }
            }
        });

        // Extract images
        for (const img of imagesInDoc) {
            if (!img.isAlphaLayer) {
                if (img.type === 'jpg') {
                    // Convert Uint8Array to Buffer for JPG images
                    imageBuffers.push(Buffer.from(img.data));
                } else {
                    // PNG images are already converted to Buffer by savePng
                    const pngBuffer = await savePng(img);
                    imageBuffers.push(pngBuffer);
                }
            }
        }

        return imageBuffers;
    } catch (error) {
        console.error('Error extracting images from PDF:', error);
        return [];
    }
};
