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
  w?: number;
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

interface RawTextFragment {
  x: number;
  y: number;
  w: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  text: string;
}

interface PositionedTextSegment {
  x: number;
  y: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  text: string;
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

        const textNodes = this.buildTextSegments(page)
          .map((segment) => this.segmentToHtml(segment, heightPt))
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
        white-space: pre-wrap;
        transform-origin: top left;
        line-height: 1.15;
        color: #111827;
      }
    </style>
  </head>
  <body>
${renderedPages}
  </body>
</html>`;
  }

  private buildTextSegments(page: Pdf2JsonPage): PositionedTextSegment[] {
    const fragments = this.extractRawTextFragments(page);
    if (!fragments.length) {
      return [];
    }

    const pageWidth = page.Width || 37;
    const lineTolerance = 0.22;
    const columnBreakThreshold = Math.max(pageWidth * 0.16, 4.2);

    const segments: PositionedTextSegment[] = [];
    let current = {
      x: fragments[0].x,
      y: fragments[0].y,
      fontSize: fragments[0].fontSize,
      bold: fragments[0].bold,
      italic: fragments[0].italic,
      text: fragments[0].text,
      lastX: fragments[0].x,
    };

    for (let index = 1; index < fragments.length; index += 1) {
      const fragment = fragments[index];
      const sameLine = Math.abs(fragment.y - current.y) <= lineTolerance;
      const sameStyle =
        Math.abs(fragment.fontSize - current.fontSize) < 0.4 &&
        fragment.bold === current.bold &&
        fragment.italic === current.italic;

      const xJump = fragment.x - current.lastX;
      const wentBack = fragment.x + 0.2 < current.lastX;
      const jumpedColumn = xJump > columnBreakThreshold;

      const shouldSplit = !sameLine || !sameStyle || wentBack || jumpedColumn;

      if (shouldSplit) {
        segments.push({
          x: current.x,
          y: current.y,
          fontSize: current.fontSize,
          bold: current.bold,
          italic: current.italic,
          text: current.text,
        });

        current = {
          x: fragment.x,
          y: fragment.y,
          fontSize: fragment.fontSize,
          bold: fragment.bold,
          italic: fragment.italic,
          text: fragment.text,
          lastX: fragment.x,
        };
        continue;
      }

      current.text += fragment.text;
      current.lastX = fragment.x;
    }

    segments.push({
      x: current.x,
      y: current.y,
      fontSize: current.fontSize,
      bold: current.bold,
      italic: current.italic,
      text: current.text,
    });

    return segments;
  }

  private extractRawTextFragments(page: Pdf2JsonPage): RawTextFragment[] {
    return (page.Texts || [])
      .map((textNode) => {
        const runs = textNode.R || [];
        const text = runs.map((run) => this.decodePdfText(run.T || '')).join('');
        if (text.length === 0) {
          return null;
        }

        const styleToken = runs.find((run) => Array.isArray(run.TS))?.TS || [];

        return {
          x: textNode.x || 0,
          y: textNode.y || 0,
          w: textNode.w || 0,
          fontSize: this.normalizeFontSize(styleToken[1]),
          bold: styleToken[2] === 1,
          italic: styleToken[3] === 1,
          text,
        };
      })
      .filter((item): item is RawTextFragment => Boolean(item))
      .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  }

  private segmentToHtml(segment: PositionedTextSegment, pageHeightPt: number): string {
    if (!segment.text.trim()) {
      return '';
    }

    const xPt = this.toPoints(segment.x);
    const yPt = this.toPoints(segment.y);
    const baselineOffset = segment.fontSize * 0.82;
    const topPt = this.clamp(
      yPt - baselineOffset,
      0,
      Math.max(pageHeightPt - segment.fontSize, 0),
    );
    const normalizedTopPt = Number(topPt.toFixed(2));

    const style = [
      `left:${xPt}pt`,
      `top:${normalizedTopPt}pt`,
      `font-size:${segment.fontSize}pt`,
      segment.bold ? 'font-weight:700' : 'font-weight:400',
      segment.italic ? 'font-style:italic' : 'font-style:normal',
    ].join(';');

    return `<p class="t" style="${style}">${this.escapeHtml(segment.text)}</p>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
