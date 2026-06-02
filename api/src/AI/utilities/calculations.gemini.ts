const geminiPricing = [
    {
        Model: 'Gemini 1.5 Flash (Free)',
        'RPM(requests per minute)': 15,
        'TPM(tokens per minute)': 1000000,
        'RPD(requests per day)': 1500,
        'Price Input/1 million tokens (<128k tokens)': 0,
        'Price Input/1 million tokens (>128k tokens)': 0,
        'Price output/1 million tokens(<128k)': 0,
        'Price output/1 million tokens(>128k)': 0,
    },
    {
        Model: 'Gemini 1.5 Flash (Pay)',
        'RPM(requests per minute)': 1000,
        'TPM(tokens per minute)': 4000000,
        'RPD(requests per day)': 0,
        'Price Input/1 million tokens (<128k tokens)': 0.35,
        'Price Input/1 million tokens (>128k tokens)': 0.7,
        'Price output/1 million tokens(<128k)': 1.05,
        'Price output/1 million tokens(>128k)': 2.1,
    },
    {
        Model: 'Gemini 1.0 Pro (Free)',
        'RPM(requests per minute)': 15,
        'TPM(tokens per minute)': 32000,
        'RPD(requests per day)': 1500,
        'Price Input/1 million tokens (<128k tokens)': 0,
        'Price Input/1 million tokens (>128k tokens)': 0,
        'Price output/1 million tokens(<128k)': 0,
        'Price output/1 million tokens(>128k)': 0,
    },
    {
        Model: 'Gemini 1.0 Pro (Pay)',
        'RPM(requests per minute)': 360,
        'TPM(tokens per minute)': 120000,
        'RPD(requests per day)': 30000,
        'Price Input/1 million tokens (<128k tokens)': 1.5,
        'Price Input/1 million tokens (>128k tokens)': 1.5,
        'Price output/1 million tokens(<128k)': 1.5,
        'Price output/1 million tokens(>128k)': 1.5,
    },
    {
        Model: 'Gemini 1.5 Pro (Free)',
        'RPM(requests per minute)': 2,
        'TPM(tokens per minute)': 32000,
        'RPD(requests per day)': 50,
        'Price Input/1 million tokens (<128k tokens)': 0,
        'Price Input/1 million tokens (>128k tokens)': 0,
        'Price output/1 million tokens(<128k)': 0,
        'Price output/1 million tokens(>128k)': 0,
    },
    {
        Model: 'Gemini 1.5 Pro (Pay)',
        'RPM(requests per minute)': 360,
        'TPM(tokens per minute)': 4000000,
        'RPD(requests per day)': 10000,
        'Price Input/1 million tokens (<128k tokens)': 3.5,
        'Price Input/1 million tokens (>128k tokens)': 7.0,
        'Price output/1 million tokens(<128k)': 10.5,
        'Price output/1 million tokens(>128k)': 21.0,
    },
];

export function calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
): {
    inputPrice: number;
    outputPrice: number;
    totalCost: number;
} {
    for (let i = 0; i < geminiPricing.length; i++) {
        let currentPricing = geminiPricing[i];

        //

        if (currentPricing.Model.includes(model)) {
            let inputPrice = inputTokens > 128000 ? (currentPricing['Price Input/1 million tokens (>128k tokens)'] / 1000000) * inputTokens : (currentPricing['Price Input/1 million tokens (<128k tokens)'] / 1000000) * inputTokens;
            let outputPrice = outputTokens > 128000 ? (currentPricing['Price output/1 million tokens(>128k)'] / 1000000) * outputTokens : (currentPricing['Price output/1 million tokens(<128k)'] / 1000000) * outputTokens;

            return {
                inputPrice,
                outputPrice,
                totalCost: inputPrice + outputPrice,
            };
        }
    }

    return {
        inputPrice: 0,
        outputPrice: 0,
        totalCost: 0,
    };
}
