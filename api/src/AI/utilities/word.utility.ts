import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

// Function to extract images from a DOCX buffer
export const getImagesFromDocx = async (docxBuffer: Buffer) => {
    // Load the DOCX file content using PizZip
    const zip = new PizZip(docxBuffer);

    // Load the content into Docxtemplater
    const doc = new Docxtemplater();
    doc.loadZip(zip);

    // Function to extract images
    const extractImages = (zip: any) => {
        // TODO: NOT IMPLEMENTED - HANDLE TYPES OF THE ARRAYS
        const images: any[] = [];
        const files = zip.files;
        for (let filename in files) {
            if (filename.startsWith('word/media/') && /\.(png|jpg|jpeg|gif)$/i.test(filename)) {
                const imageBuffer = files[filename].asNodeBuffer();
                images.push(imageBuffer);
            }
        }
        return images;
    };

    // Extract images from the DOCX file
    const images = extractImages(zip);

    return images;
};
