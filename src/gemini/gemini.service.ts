import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface OptimizeInput {
  resumeHtml: string;
  jobDescription: string;
  immutableData: string;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

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

@Injectable()
export class GeminiService {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly apiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.model = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash';
  }

  async optimizeResume(input: OptimizeInput): Promise<string> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        'GEMINI_API_KEY não configurada no ambiente.',
      );
    }

    const prompt = this.buildPrompt(input);

    try {
      const endpoint = `${this.apiBaseUrl}/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
        }),
      });

      if (!response.ok) {
        const rawError = await response.text();
        throw new BadGatewayException(
          `Gemini retornou erro HTTP ${response.status}: ${rawError || 'sem detalhes'}`,
        );
      }

      const data = (await response.json()) as GeminiGenerateContentResponse;
      const rawOutput = this.extractTextFromResponse(data).trim();
      if (!rawOutput) {
        throw new BadGatewayException('O Gemini retornou uma resposta vazia.');
      }

      const cleanedOutput = this.stripCodeFences(rawOutput).trim();
      if (!this.looksLikeHtml(cleanedOutput)) {
        throw new BadGatewayException(
          'A resposta do Gemini não está em formato HTML válido.',
        );
      }

      return cleanedOutput;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'Erro desconhecido no Gemini';
      throw new BadGatewayException(`Falha ao otimizar currículo com IA: ${message}`);
    }
  }

  private extractTextFromResponse(response: GeminiGenerateContentResponse): string {
    const parts = response.candidates?.[0]?.content?.parts || [];
    return parts
      .map((part) => part.text || '')
      .join('')
      .trim();
  }

  private buildPrompt({ resumeHtml, jobDescription, immutableData }: OptimizeInput): string {
    return `Dados que não podem ser alterados:\n${immutableData}\n\nDescrição da vaga:\n${jobDescription}\n\nHTML original do currículo:\n${resumeHtml}\n\nAgora gere a versão final otimizada do currículo e retorne apenas o HTML final.`;
  }

  private stripCodeFences(value: string): string {
    return value
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '');
  }

  private looksLikeHtml(value: string): boolean {
    return /<\s*([a-z][a-z0-9]*)\b[^>]*>/i.test(value);
  }
}
