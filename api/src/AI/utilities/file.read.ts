import { HttpException, HttpStatus } from '@nestjs/common';
import * as path from 'path';
import * as WordExtractor from 'word-extractor';
import xlsx from 'node-xlsx';
import * as pdf from 'pdf-parse';
import { getImageFromPdf } from '../utilities/pdf.utility';
import { getImagesFromDocx } from '../utilities/word.utility';
import * as Tesseract from 'tesseract.js';
import { ACCEPTED_FILE_MIME_TYPES, ACCEPTED_FILE_NOTATIONS } from '@Sibasi/core';

async function checkFileType(file: Express.Multer.File) {
    const allowedMimeTypes = [...ACCEPTED_FILE_MIME_TYPES];
    const allowedFileNotations = [...ACCEPTED_FILE_NOTATIONS];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (!(allowedMimeTypes.includes(file.mimetype) && allowedFileNotations.includes(fileExt))) {
        throw new HttpException(`Only ${ACCEPTED_FILE_NOTATIONS.join(' or ')} files are allowed!`, HttpStatus.BAD_REQUEST);
    } else {
        return fileExt;
    }
}

export async function checkFileTypes(files: Express.Multer.File[]) {
    const allowedMimeTypes = new Set(ACCEPTED_FILE_MIME_TYPES);
    const allowedFileNotations = new Set(ACCEPTED_FILE_NOTATIONS);

    return files.map((file) => {
        const fileExt = path.extname(file.originalname).toLowerCase();
        if (!allowedMimeTypes.has(file.mimetype) || !allowedFileNotations.has(fileExt)) {
            throw new HttpException(`Only ${[...allowedFileNotations].join(' or ')} files are allowed!`, HttpStatus.BAD_REQUEST);
        }
        return fileExt;
    });
}

async function parsePdf(file: Express.Multer.File) {
    try {
        const data = await pdf(file.buffer);
        return data.text;
    } catch (error: any) {
        throw new HttpException(`Error parsing file ${file.originalname}: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
}

async function parsePptx(file: Express.Multer.File) {
    try {
        console.log(`\n\nFile read in parsePDF: ${file.originalname}`);
        console.log(`File Type: ${file.mimetype}`);
        console.log(`File Size: ${file.size} bytes`);
        const data = await pdf({ data: file.buffer });

        console.log(`File text: ${data.text.substring(0, 100)}`); // Log the first 100 characters of the text
        return data.text;
    } catch (error: any) {
        console.log('An error occured in parsePdf', error);
        throw new HttpException(`Error parsing file ${file.originalname}: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
}

async function parseDocDocx(file: Express.Multer.File) {
    try {
        let extractor = new WordExtractor();
        let data = await extractor.extract(file.buffer);
        return data.getBody().trim();
    } catch (error: any) {
        console.log('An error occured in parseDoc', error);
        throw new HttpException(`Error parsing file ${file.originalname}: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
}

async function parseXlsxXls(file: Express.Multer.File) {
    try {
        const data = xlsx.parse(file.buffer);
        let results: string = '';

        data.forEach((sheet) => {
            results = results + sheet.name + '\n';

            sheet.data.forEach((row) => {
                if (row.length > 0) {
                    results = results + '\n' + row.join(' ');
                }
            });
        });

        return results.trim();
    } catch (error: any) {
        console.log('An error occured in parseXlsxXls', error);
        throw new HttpException(`Error parsing file ${file.originalname}: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
}

async function handleOCR(imageBuffers: Buffer[]) {
    let text = '';
    for (let i = 0; i < imageBuffers.length; i++) {
        let buffer = imageBuffers[i];
        try {
            const data = await Tesseract.recognize(buffer, 'eng');
            text = text + data.data.text;
        } catch (error: any) {
            throw new HttpException(`${error.message}`, HttpStatus.BAD_REQUEST);
        }
    }

    return text;
}

export async function getDataFromFile(file: Express.Multer.File, fileType?: string) {
    if (!file) {
        throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    }

    if (!fileType) {
        // console.log("It came here in check file");
        fileType = await checkFileType(file);
    }

    // const fileType = await checkFileType(file);
    let data: any;
    if (['.pdf'].includes(fileType)) {
        data = await parsePdf(file);
        // let extractedImages = await getImageFromPdf(file.buffer);
        // if(extractedImages.length > 0){
        //     data = data + `\n\n Textual data extracted from images within the document:\n\n` + await handleOCR(extractedImages);
        // }
    } else if (['.pptx'].includes(fileType)) {
        data = await parsePptx(file);
    } else if (['.xls', '.xlsx'].includes(fileType)) {
        data = await parseXlsxXls(file);
    } else if (['.doc', '.docx'].includes(fileType)) {
        data = await parseDocDocx(file);
        // if(fileType === ".docx"){
        //     let extractedImages = await getImagesFromDocx(file.buffer)
        //     if(extractedImages.length > 0){
        //         data = data + await handleOCR(extractedImages);
        //     }
        // }
    } else if (['.txt'].includes(fileType)) {
        data = file.buffer.toString('utf8');
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif'].includes(fileType)) {
        data = await handleOCR([file.buffer]);
    }
    return data;
}

// function then(arg0: (data: any) => void) {
//     throw new Error('Function not implemented.');
// }
