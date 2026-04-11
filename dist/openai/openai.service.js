"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = __importDefault(require("openai"));
const SYSTEM_PROMPT = `Você é um especialista em recrutamento, currículos e otimização para ATS.
Sua tarefa é adaptar um currículo em HTML para uma vaga específica, maximizando a aderência ao ATS de forma ética e profissional.

Regras obrigatórias:
- Retorne somente o HTML final do currículo.
- Não use markdown.
- Não use blocos de código.
- Não escreva explicações.
- Não escreva comentários antes ou depois do HTML.
- Não invente experiências, resultados ou qualificações que não existam no currículo.
- Você pode reorganizar, reescrever e otimizar o conteúdo para melhorar clareza, palavras-chave e aderência à vaga.
- Preserve obrigatoriamente os dados marcados como não alteráveis.
- O HTML retornado deve estar completo e válido para renderização.`;
let OpenAiService = class OpenAiService {
    constructor(configService) {
        this.configService = configService;
        const apiKey = this.configService.get('OPENAI_API_KEY');
        if (apiKey) {
            this.client = new openai_1.default({ apiKey });
        }
        this.model = this.configService.get('OPENAI_MODEL') || 'gpt-4.1-mini';
    }
    async optimizeResume(input) {
        if (!this.client) {
            throw new common_1.InternalServerErrorException('OPENAI_API_KEY não configurada no ambiente.');
        }
        const prompt = this.buildPrompt(input);
        try {
            const response = await this.client.responses.create({
                model: this.model,
                input: [
                    {
                        role: 'system',
                        content: [{ type: 'input_text', text: SYSTEM_PROMPT }],
                    },
                    {
                        role: 'user',
                        content: [{ type: 'input_text', text: prompt }],
                    },
                ],
            });
            const rawOutput = response.output_text?.trim();
            if (!rawOutput) {
                throw new common_1.BadGatewayException('A OpenAI retornou uma resposta vazia.');
            }
            const cleanedOutput = this.stripCodeFences(rawOutput).trim();
            if (!this.looksLikeHtml(cleanedOutput)) {
                throw new common_1.BadGatewayException('A resposta da OpenAI não está em formato HTML válido.');
            }
            return cleanedOutput;
        }
        catch (error) {
            if (error instanceof common_1.BadGatewayException) {
                throw error;
            }
            const message = error instanceof Error ? error.message : 'Erro desconhecido na OpenAI';
            throw new common_1.BadGatewayException(`Falha ao otimizar currículo com IA: ${message}`);
        }
    }
    buildPrompt({ resumeHtml, jobDescription, immutableData }) {
        return `Dados que não podem ser alterados:\n${immutableData}\n\nDescrição da vaga:\n${jobDescription}\n\nHTML original do currículo:\n${resumeHtml}\n\nAgora gere a versão final otimizada do currículo e retorne apenas o HTML final.`;
    }
    stripCodeFences(value) {
        return value
            .replace(/^```html\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```$/i, '');
    }
    looksLikeHtml(value) {
        return /<\s*([a-z][a-z0-9]*)\b[^>]*>/i.test(value);
    }
};
exports.OpenAiService = OpenAiService;
exports.OpenAiService = OpenAiService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenAiService);
//# sourceMappingURL=openai.service.js.map