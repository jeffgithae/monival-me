import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PhiService {
    async getPhiResponse(prompt: string) {
        const response = await axios.post(`http://localhost:11434/api/generate`, {
            model: 'phi3',
            prompt: prompt,
            stream: false,
        });
        let data = response.data.done ? response.data.response : `Phi did not respond`;

        return data;
    }
}
