import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

interface OptimizeInput {
  resumeHtml: string;
  jobDescription: string;
  immutableData: string;
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
export class OpenAiService {
  private readonly client?: OpenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
    this.model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4.1-mini';
  }

  async optimizeResume(input: OptimizeInput): Promise<string> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'OPENAI_API_KEY não configurada no ambiente.',
      );
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
        throw new BadGatewayException('A OpenAI retornou uma resposta vazia.');
      }

      const cleanedOutput = this.stripCodeFences(rawOutput).trim();
      if (!this.looksLikeHtml(cleanedOutput)) {
        throw new BadGatewayException(
          'A resposta da OpenAI não está em formato HTML válido.',
        );
      }

      return cleanedOutput;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'Erro desconhecido na OpenAI';
      throw new BadGatewayException(`Falha ao otimizar currículo com IA: ${message}`);
    }
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
