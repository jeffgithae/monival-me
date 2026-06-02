const openAIPricing = [
    {
        Model: 'GPT-4o-mini Global Deployment',
        'RPM(requests per minute)': 20000,
        'TPM(tokens per minute)': 2000000,
        'RPD(requests per day)': -1,
        'Price Input/1 million tokens (128k tokens)': 0.15,
        'Price output/1 million tokens(128k)': 0.6,
    },
    {
        Model: 'text-embedding-3-large',
        'RPM(requests per minute)': 1800,
        'TPM(tokens per minute)': 300000,
        'RPD(requests per day)': -1,
        'Price/1 million tokens': 0.13,
    },
    {
        Model: 'text-embedding-ada-002',
        'RPM(requests per minute)': 1440,
        'TPM(tokens per minute)': 240000,
        'RPD(requests per day)': -1,
        'Price/1 million tokens': 0.1,
    },
    {
        Model: 'whisper',
        'RPM(requests per minute)': 3,
        'TPM(tokens per minute)': -1,
        'RPD(requests per day)': -1,
        'Price/1 million tokens': -1,
    },
];

export function calculateChatCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
): {
    inputTokens: number;
    outputTokens: number;
    inputCost: number;
    outputCost: number;
    totalCost: number;
} {
    for (let i = 0; i < openAIPricing.length; i++) {
        let currentPricing = openAIPricing[i];

        if (currentPricing.Model.includes(model)) {
            const priceInput = currentPricing['Price Input/1 million tokens (128k tokens)'];
            const priceOutput = currentPricing['Price output/1 million tokens(128k)'];

            if (typeof priceInput !== 'number' || typeof priceOutput !== 'number') {
                throw new Error('Pricing info not available for this model!');
            }

            let inputCost = (priceInput / 1000000) * inputTokens;
            let outputCost = (priceOutput / 1000000) * outputTokens;

            return {
                inputTokens,
                outputTokens,
                inputCost,
                outputCost,
                totalCost: inputCost + outputCost,
            };
        }
    }

    return {
        inputTokens,
        outputTokens,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
    };
}

export function calculateLangchainCost(
    model: string,
    langchainPromptUsage: any[],
): {
    inputTokens: number;
    outputTokens: number;
    inputCost: number;
    outputCost: number;
    totalCost: number;
} {
    let output = {
        inputTokens: 0,
        outputTokens: 0,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
    };

    for (let i = 0; i < langchainPromptUsage.length; i++) {
        let currentUsage = langchainPromptUsage[i];
        let currentPriceUsage = calculateChatCost(model, currentUsage.llmOutput.tokenUsage.promptTokens || 0, currentUsage.llmOutput.tokenUsage.completionTokens || 0);
        output.inputCost += currentPriceUsage.inputCost;
        output.outputCost += currentPriceUsage.outputCost;
        output.totalCost += currentPriceUsage.totalCost;
        output.inputTokens += currentUsage.llmOutput.tokenUsage.promptTokens || 0;
        output.outputTokens += currentUsage.llmOutput.tokenUsage.completionTokens || 0;
    }

    return output;
}

export function calculateEmbeddingsCost(model: string, tokens: number) {
    for (let i = 0; i < openAIPricing.length; i++) {
        let currentPricing = openAIPricing[i];

        if (currentPricing.Model.includes(model)) {
            const pricePerMillion = currentPricing['Price/1 million tokens'];

            if (typeof pricePerMillion !== 'number') {
                throw new Error('Pricing info not available for this model!');
            }

            let price = (pricePerMillion / 1000000) * tokens;

            return {
                totalCost: price,
            };
        }
    }

    return { totalCost: 0 };
}
