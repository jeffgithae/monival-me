import { Provider } from '@nestjs/common';
import { getEnvNumber, getEnvStringRequired } from '@Sibasi/core/common';

// 1. Interface for type safety
export interface AzureOpenAIConfig {
    apiKey: string;
    instanceName: string;
    deploymentName: string;
    apiVersion: string;
    embeddingDeploymentName: string;
    embeddingApiVersion: string;
    maxTokens?: number;
    temperature?: number;
}

// 2. Provider definition for DI
export const AzureOpenAIConfigProvider: Provider = {
    provide: 'AZURE_OPENAI_CONFIG',
    useFactory: (): AzureOpenAIConfig => {
        return {
            apiKey: getEnvStringRequired('OPENAI_API_KEY', 'azure-openai-key-not-set'),
            instanceName: getEnvStringRequired('AZUREOPENAIAPIINSTANCENAME', 'azure-openai-instance-not-set'),
            deploymentName: getEnvStringRequired('AZUREOPENAIAPIDEPLOYMENTNAME', 'azure-openai-deployment-not-set'),
            apiVersion: getEnvStringRequired('AZUREOPENAIAPIVERSION', 'azure-openai-version-not-set'),
            embeddingDeploymentName: getEnvStringRequired('AZUREMBEDDINGSMODELDEPLOYMENTNAME', 'azure-embedding-deployment-not-set'),
            embeddingApiVersion: getEnvStringRequired('AZUREMBEDDINGSMODELAPIVERSION', 'azure-embedding-version-not-set'),
            maxTokens: getEnvNumber('MAX_OUTPUT_TOKENS', 10000),
            temperature: getEnvNumber('TEMPERATURE', 0.3),
        };
    },
};
