import { Request } from 'express';
import { extname } from 'path';
import { HttpException, HttpStatus } from '@nestjs/common';

export const fileFilter = (req: Request, file: Express.Multer.File, callback: Function) => {
    // Allowed file types
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const fileExt = extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(file.mimetype) && ['.pdf', '.doc', '.docx'].includes(fileExt)) {
        // Accept file
        callback(null, true);
    } else {
        // Reject file

        callback(new HttpException('Only .pdf, .doc, and .docx files are allowed!', HttpStatus.BAD_REQUEST), false);
    }
};

export const parseAIResponse = (response: string) => {
    // Remove the word 'json' and the quotes around the JSON string
    const jsonString = response.replace(/```json|```/g, '').trim();
    // Parse the cleaned JSON string to a JavaScript object
    try {
        const jsonObject = JSON.parse(jsonString);
        return jsonObject;
    } catch (error) {
        throw new HttpException('Error parsing AI response to json', HttpStatus.BAD_REQUEST);
    }
};
