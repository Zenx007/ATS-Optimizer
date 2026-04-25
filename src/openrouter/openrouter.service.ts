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

interface OpenRouterChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
}

const SYSTEM_PROMPT = `Você é um especialista em recrutamento, currículos e otimização para ATS.
Sua tarefa é adaptar um currículo em HTML para uma vaga específica, maximizando a aderência ao ATS de forma ética e profissional.

Regras obrigatórias:

    Retorne somente o HTML final do currículo.
    Não use markdown.
    Não use blocos de código.
    Não escreva explicações.
    Não escreva comentários antes ou depois do HTML.
    Não devolva o currículo com a mesma estrutura original.
    Crie uma nova formatação HTML do currículo (nova organização visual e semântica), mantendo profissionalismo e legibilidade.
    Use obrigatoriamente os dados recebidos em "Dados que não podem ser alterados", "Descrição da vaga" e "HTML original do currículo".
    Você pode reorganizar, reescrever e otimizar o conteúdo para melhorar clareza, palavras-chave e aderência à vaga.
    Preserve obrigatoriamente os dados marcados como não alteráveis.
    O HTML retornado deve estar completo e válido para renderização.
    Deixe o curriculo passando com 100% do ATS de acordo com a vaga
    Encaixe todas as keywords de forma natural no curriculo
`;

@Injectable()
export class OpenRouterService {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly apiBaseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  private readonly httpReferer?: string;
  private readonly appTitle?: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    this.model = this.configService.get<string>('OPENROUTER_MODEL') || 'Ling-2.6-flash';
    this.httpReferer = this.configService.get<string>('OPENROUTER_HTTP_REFERER');
    this.appTitle = this.configService.get<string>('OPENROUTER_APP_TITLE');
  }

  async optimizeResume(input: OptimizeInput): Promise<string> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        'OPENROUTER_API_KEY não configurada no ambiente.',
      );
    }

    const prompt = this.buildPrompt(input);

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      };
      if (this.httpReferer) {
        headers['HTTP-Referer'] = this.httpReferer;
      }
      if (this.appTitle) {
        headers['X-OpenRouter-Title'] = this.appTitle;
      }

      const response = await fetch(this.apiBaseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const rawError = await response.text();
        throw new BadGatewayException(
          `OpenRouter retornou erro HTTP ${response.status}: ${rawError || 'sem detalhes'}`,
        );
      }

      const data = (await response.json()) as OpenRouterChatCompletionResponse;
      const rawOutput = this.extractTextFromResponse(data).trim();
      if (!rawOutput) {
        throw new BadGatewayException('O OpenRouter retornou uma resposta vazia.');
      }

      const cleanedOutput = this.stripCodeFences(rawOutput).trim();
      if (!this.looksLikeHtml(cleanedOutput)) {
        throw new BadGatewayException(
          'A resposta do OpenRouter não está em formato HTML válido.',
        );
      }

      return cleanedOutput;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'Erro desconhecido no OpenRouter';
      throw new BadGatewayException(`Falha ao otimizar currículo com IA: ${message}`);
    }
  }

  private extractTextFromResponse(response: OpenRouterChatCompletionResponse): string {
    const content = response.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => (item.type === 'text' ? item.text || '' : ''))
        .join('')
        .trim();
    }

    return '';
  }

  private buildPrompt({ resumeHtml, jobDescription, immutableData }: OptimizeInput): string {
    return `Dados que não podem ser alterados:\n${immutableData}\n\nDescrição da vaga:\n${jobDescription}\n\nHTML original do currículo:\n${resumeHtml}\n\nAgora gere uma versão final otimizada do currículo em uma NOVA FORMATAÇÃO HTML (não reutilize a mesma estrutura original) e retorne apenas o HTML final.`;
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
