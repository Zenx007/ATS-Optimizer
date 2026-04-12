import { BadRequestException, Injectable } from '@nestjs/common';
import { load } from 'cheerio';
import puppeteer from 'puppeteer';
// pdf2json exposes a CommonJS class constructor.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFParser = require('pdf2json');

interface Pdf2JsonTextRun {
  T?: string;
  TS?: number[];
}

interface Pdf2JsonText {
  x?: number;
  y?: number;
  R?: Pdf2JsonTextRun[];
}

interface Pdf2JsonPage {
  Width?: number;
  Height?: number;
  Texts?: Pdf2JsonText[];
}

interface Pdf2JsonData {
  Pages?: Pdf2JsonPage[];
}

@Injectable()
export class PdfService {
  private static readonly PDF2JSON_UNIT_TO_PT = 16;

  async convertPdfBufferToHtml(pdfBuffer: Buffer): Promise<string> {
    if (!pdfBuffer?.length) {
      throw new BadRequestException('Arquivo PDF vazio ou inválido.');
    }

    const parsed = await this.parsePdfWithCoordinates(pdfBuffer);
    const pages = parsed.Pages ?? [];

    if (!pages.length) {
      throw new BadRequestException(
        'Não foi possível extrair estrutura do PDF para HTML.',
      );
    }

    return this.positionedPdfToHtml(pages);
  }

  async convertHtmlToPdfBuffer(html: string): Promise<Buffer> {
    if (!this.isValidHtml(html)) {
      throw new BadRequestException('HTML otimizado inválido para geração de PDF.');
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm',
        },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  isValidHtml(html: string): boolean {
    if (!html || typeof html !== 'string') {
      return false;
    }

    const hasTag = /<\s*([a-z][a-z0-9]*)\b[^>]*>/i.test(html);
    if (!hasTag) {
      return false;
    }

    const $ = load(html);
    const extractedText = $.root().text().trim();
    return extractedText.length > 0;
  }

  private parsePdfWithCoordinates(pdfBuffer: Buffer): Promise<Pdf2JsonData> {
    return new Promise((resolve, reject) => {
      const pdfParser = new PDFParser();

      pdfParser.on('pdfParser_dataReady', (data: Pdf2JsonData) => resolve(data));
      pdfParser.on('pdfParser_dataError', (error: { parserError?: Error }) => {
        reject(error?.parserError || new Error('Falha ao processar PDF.'));
      });

      pdfParser.parseBuffer(pdfBuffer);
    });
  }

  private positionedPdfToHtml(pages: Pdf2JsonPage[]): string {
    const renderedPages = pages
      .map((page) => {
        const widthPt = this.toPoints(page.Width || 0);
        const heightPt = this.toPoints(page.Height || 0);

        if (!widthPt || !heightPt) {
          return '';
        }

        const textNodes = (page.Texts || [])
          .map((text) => this.textNodeToHtml(text))
          .filter(Boolean)
          .join('\n');

        return `<section class="pdf-page" style="width:${widthPt}pt;height:${heightPt}pt;">${textNodes}</section>`;
      })
      .filter(Boolean)
      .join('\n');

    if (!renderedPages) {
      throw new BadRequestException('PDF sem conteúdo renderizável.');
    }

    return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Currículo</title>
    <style>
      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: #f4f4f5;
      }

      body {
        padding: 24px 0;
      }

      .pdf-page {
        position: relative;
        margin: 0 auto 20px auto;
        background: #fff;
        box-shadow: 0 2px 14px rgba(0, 0, 0, 0.12);
        overflow: hidden;
      }

      .t {
        position: absolute;
        margin: 0;
        padding: 0;
        white-space: pre;
        transform-origin: top left;
        line-height: 1;
        color: #111827;
      }
    </style>
  </head>
  <body>
${renderedPages}
  </body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private textNodeToHtml(textNode: Pdf2JsonText): string {
    const xPt = this.toPoints(textNode.x || 0);
    const yPt = this.toPoints(textNode.y || 0);

    const runs = textNode.R || [];
    const content = runs.map((run) => this.decodePdfText(run.T || '')).join('');

    if (!content.trim()) {
      return '';
    }

    const styleToken = runs.find((run) => Array.isArray(run.TS))?.TS || [];
    const fontSizePt = this.normalizeFontSize(styleToken[1]);
    const bold = styleToken[2] === 1;
    const italic = styleToken[3] === 1;

    const style = [
      `left:${xPt}pt`,
      `top:${yPt}pt`,
      `font-size:${fontSizePt}pt`,
      bold ? 'font-weight:700' : 'font-weight:400',
      italic ? 'font-style:italic' : 'font-style:normal',
    ].join(';');

    return `<p class="t" style="${style}">${this.escapeHtml(content)}</p>`;
  }

  private decodePdfText(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private toPoints(value: number): number {
    return Number((value * PdfService.PDF2JSON_UNIT_TO_PT).toFixed(2));
  }

  private normalizeFontSize(value: number | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 12;
    }

    if (value < 1) {
      return Number((value * PdfService.PDF2JSON_UNIT_TO_PT).toFixed(2));
    }

    return Number(value.toFixed(2));
  }
}
