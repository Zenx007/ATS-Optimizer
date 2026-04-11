import { ConfigService } from '@nestjs/config';
interface OptimizeInput {
    resumeHtml: string;
    jobDescription: string;
    immutableData: string;
}
export declare class OpenAiService {
    private readonly configService;
    private readonly client?;
    private readonly model;
    constructor(configService: ConfigService);
    optimizeResume(input: OptimizeInput): Promise<string>;
    private buildPrompt;
    private stripCodeFences;
    private looksLikeHtml;
}
export {};
