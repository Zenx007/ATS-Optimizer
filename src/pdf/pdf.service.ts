import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { load } from 'cheerio';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Element, Node } from 'domhandler';
import puppeteer from 'puppeteer';

@Injectable()
export class PdfService {
  private readonly pdf2HtmlExBinary =
    process.env.PDF2HTMLEX_BIN?.trim() || 'pdf2htmlEX';

  async convertPdfBufferToHtml(pdfBuffer: Buffer): Promise<string> {
    if (!pdfBuffer?.length) {
      throw new BadRequestException('Arquivo PDF vazio ou inválido.');
    }

    const tempDirectory = path.join(tmpdir(), `ats-pdf2htmlex-${randomUUID()}`);
    const inputPdfPath = path.join(tempDirectory, 'input.pdf');
    const outputHtmlFilename = 'output.html';
    const outputHtmlPath = path.join(tempDirectory, outputHtmlFilename);

    try {
      await fs.mkdir(tempDirectory, { recursive: true });
      await fs.writeFile(inputPdfPath, pdfBuffer);

      await this.runPdf2HtmlEx([
        '--dest-dir',
        tempDirectory,
        '--split-pages',
        '0',
        '--embed-css',
        '1',
        '--embed-font',
        '0',
        '--embed-image',
        '1',
        '--embed-javascript',
        '0',
        '--embed-outline',
        '1',
        '--printing',
        '1',
        inputPdfPath,
        outputHtmlFilename,
      ]);

      const html = await fs.readFile(outputHtmlPath, 'utf-8');
      const sanitizedHtml = this.sanitizeGeneratedHtml(html);
      if (!this.hasAnyHtmlTag(sanitizedHtml)) {
        throw new BadRequestException(
          'A conversão com pdf2htmlEX não gerou HTML válido.',
        );
      }

      return sanitizedHtml;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Falha inesperada ao converter PDF para HTML com pdf2htmlEX.',
      );
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  }

  async convertHtmlToPdfBuffer(html: string): Promise<Buffer> {
      const sanitizedHtml = this.sanitizeGeneratedHtml(html);
      if (!this.isValidHtml(sanitizedHtml)) {
        throw new BadRequestException('HTML otimizado inválido para geração de PDF.');
      }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(sanitizedHtml, { waitUntil: 'networkidle0' });

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

    if (!this.hasAnyHtmlTag(html)) {
      return false;
    }

    const $ = load(html);
    const extractedText = $.root().text().trim();
    return extractedText.length > 0;
  }

  private runPdf2HtmlEx(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(this.pdf2HtmlExBinary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      childProcess.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      childProcess.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          reject(
            new InternalServerErrorException(
              `Binário "${this.pdf2HtmlExBinary}" não encontrado. Instale o pdf2htmlEX ou configure PDF2HTMLEX_BIN com o caminho completo.`,
            ),
          );
          return;
        }

        reject(
          new InternalServerErrorException(
            `Falha ao iniciar pdf2htmlEX: ${error.message}`,
          ),
        );
      });

      childProcess.on('close', (exitCode) => {
        if (exitCode === 0) {
          resolve();
          return;
        }

        const details = (stderr || stdout).trim();
        reject(
          new BadRequestException(
            details
              ? `Falha ao converter PDF para HTML com pdf2htmlEX: ${details}`
              : 'Falha ao converter PDF para HTML com pdf2htmlEX.',
          ),
        );
      });
    });
  }

  private hasAnyHtmlTag(html: string): boolean {
    return /<\s*([a-z][a-z0-9]*)\b[^>]*>/i.test(html);
  }

  sanitizeGeneratedHtml(html: string): string {
    if (!html) {
      return html;
    }

    let sanitized = html;
    sanitized = this.stripNonHtmlArtifacts(sanitized);
    sanitized = this.stripEmbeddedFontFaces(sanitized);
    sanitized = this.stripDataFontUris(sanitized);
    return sanitized;
  }

  compactPdfLikeHtml(html: string): string {
    if (!html) {
      return html;
    }

    const $ = load(html);
    const textNodes = $('.t');
    if (!textNodes.length) {
      return html;
    }

    type Segment = { top: number; left: number; text: string; bold: boolean };
    type CompactLine = { text: string; isHeading: boolean };
    const segments: Segment[] = [];
    const styleContent = $('style')
      .map((_idx, styleTag) => $(styleTag).html() || '')
      .get()
      .join('\n');
    const xByClass = this.extractClassCoordinateMap(styleContent, 'x', 'left');
    const yTopByClass = this.extractClassCoordinateMap(styleContent, 'y', 'top');
    const yBottomByClass = this.extractClassCoordinateMap(styleContent, 'y', 'bottom');

    $('.pf').each((index, pageNode) => {
      $(pageNode).attr('data-page-index', String(index));
    });

    textNodes.each((_idx, el) => {
      const node = $(el);
      const text = this.extractReadableTextFromPdfNode(el);
      if (!text) {
        return;
      }

      const style = (node.attr('style') || '').toLowerCase();
      const classNames = (node.attr('class') || '').split(/\s+/).filter(Boolean);
      const xClass = classNames.find((className) => /^x[a-z0-9]+$/i.test(className));
      const yClass = classNames.find((className) => /^y[a-z0-9]+$/i.test(className));
      const pageIndex = Number.parseInt(
        node.closest('.pf').attr('data-page-index') || '0',
        10,
      );

      let top = this.extractStyleNumber(style, 'top');
      let left = this.extractStyleNumber(style, 'left');
      const bottomFromStyle = this.extractStyleNumber(style, 'bottom');

      if (left === null && xClass) {
        left = xByClass.get(xClass) ?? null;
      }

      if (top === null && yClass) {
        const mappedTop = yTopByClass.get(yClass);
        if (mappedTop !== undefined) {
          top = mappedTop;
        } else {
          const mappedBottom = yBottomByClass.get(yClass);
          if (mappedBottom !== undefined) {
            top = -mappedBottom;
          }
        }
      }

      if (top === null && bottomFromStyle !== null) {
        top = -bottomFromStyle;
      }

      if (top === null) {
        top = segments.length;
      }

      if (left === null) {
        left = 0;
      }

      // Keep lines from different pages sorted in page order.
      top += pageIndex * 10000;
      const bold = /font-weight\s*:\s*(?:[6-9]00|bold)/i.test(style);

      segments.push({ top, left, text, bold });
    });

    if (!segments.length) {
      return html;
    }

    segments.sort((a, b) => (a.top === b.top ? a.left - b.left : a.top - b.top));

    const lines: Array<{ top: number; parts: Segment[] }> = [];
    const topTolerance = 1.2;
    for (const seg of segments) {
      const lastLine = lines[lines.length - 1];
      if (!lastLine || Math.abs(lastLine.top - seg.top) > topTolerance) {
        lines.push({ top: seg.top, parts: [seg] });
      } else {
        lastLine.parts.push(seg);
      }
    }

    const compactLines: CompactLine[] = lines
      .map((line) => {
        line.parts.sort((a, b) => a.left - b.left);
        const mergedText = this.mergeLineSegments(line.parts.map((p) => p.text));
        const boldRatio =
          line.parts.filter((part) => part.bold).length / Math.max(line.parts.length, 1);
        const uppercaseLike = /^[A-Z0-9À-Þ\s:&/-]{4,}$/.test(mergedText);
        const hasContactHints = /@|\||linkedin|github|https?:\/\/|www\./i.test(mergedText);
        const headingByBold = boldRatio >= 0.7 && mergedText.length <= 100;
        const headingByCase = uppercaseLike && mergedText.length <= 65;
        return {
          text: mergedText,
          isHeading:
            mergedText.length > 0 &&
            !hasContactHints &&
            (headingByBold || headingByCase) &&
            mergedText.length <= 80,
        };
      })
      .filter((line) => line.text.length > 0);

    if (!compactLines.length) {
      return html;
    }
    const bodyLines = compactLines.map((line, index) => {
      const escapedText = this.escapeHtml(line.text);
      if (line.isHeading) {
        const headingTag = index === 0 ? 'h1' : 'h2';
        return `  <${headingTag}>${escapedText}</${headingTag}>`;
      }
      return `  <p>${escapedText}</p>`;
    });

    return [
      '<!DOCTYPE html>',
      '<html lang="pt-BR">',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      '  <title>Currículo</title>',
      '  <style>body{font-family:Arial,sans-serif;color:#111;margin:24px auto;max-width:820px;line-height:1.45;padding:0 16px}h1{font-size:26px;margin:0 0 10px}h2{font-size:18px;margin:20px 0 8px}p{margin:0 0 8px}</style>',
      '</head>',
      '<body>',
      ...bodyLines,
      '</body>',
      '</html>',
    ].join('\n');
  }

  private stripNonHtmlArtifacts(html: string): string {
    const $ = load(html);

    $('script, noscript, iframe, object, embed').remove();
    $('#sidebar, #outline, .loading-indicator').remove();
    $('.pi').remove(); // viewer metadata (ctm/page_data) not needed without js viewer
    $('[data-page-url], [data-data], [data-dest-detail]').removeAttr(
      'data-page-url data-data data-dest-detail',
    );
    this.handlePageContainer($);

    this.removeComments($.root()[0]);
    return $.html();
  }

  private stripEmbeddedFontFaces(html: string): string {
    const withoutEmbeddedFontFaces = html.replace(/@font-face\s*{[\s\S]*?}\s*/gi, '');

    return withoutEmbeddedFontFaces.replace(
      /src\s*:\s*url\(\s*['"]?data:(?:application\/(?:x-)?font-[^;,\s]+|application\/octet-stream|font\/[^;,\s]+)(?:;[^;,]+)*;base64,[^'")]+['"]?\s*\)\s*;?/gi,
      '',
    );
  }

  private stripDataFontUris(html: string): string {
    return html
      .replace(
        /data:(?:application\/(?:x-)?font-[^;,\s]+|application\/octet-stream|font\/[^;,\s]+)(?:;[^;,]+)*;base64,[a-z0-9+/=\s]+/gi,
        '',
      )
      .replace(/url\(\s*['"]?\s*['"]?\s*\)/gi, 'none');
  }

  private removeComments(node?: Node | null): void {
    if (!node || !(node as Element).children) {
      return;
    }

    const element = node as Element;
    element.children = element.children.filter((child) => child.type !== 'comment');
    for (const child of element.children) {
      this.removeComments(child);
    }
  }

  private handlePageContainer($: ReturnType<typeof load>): void {
    const first = $('#page-container').first();
    if (!first.length) {
      return;
    }

    first.replaceWith(first.contents());
    $('#page-container').remove();
  }

  private extractStyleNumber(
    style: string,
    key: 'top' | 'left' | 'bottom',
  ): number | null {
    const match = style.match(new RegExp(`${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
    if (!match) {
      return null;
    }

    const value = Number.parseFloat(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  private mergeLineSegments(parts: string[]): string {
    let out = '';
    for (const partRaw of parts) {
      const part = partRaw.trim();
      if (!part) {
        continue;
      }

      if (!out) {
        out = part;
        continue;
      }

      const noLeadingSpace = /^[,.;:!?)]/.test(part);
      const noTrailingSpace = /[(/,-]$/.test(out);
      out += noLeadingSpace || noTrailingSpace ? part : ` ${part}`;
    }

    return out.replace(/\s+/g, ' ').trim();
  }

  private extractClassCoordinateMap(
    css: string,
    prefix: 'x' | 'y',
    property: 'left' | 'top' | 'bottom',
  ): Map<string, number> {
    const map = new Map<string, number>();
    const pattern = new RegExp(
      `\\.(${prefix}[a-z0-9]+)\\s*\\{[^}]*?${property}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)(?:px)?`,
      'gi',
    );

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(css)) !== null) {
      const value = Number.parseFloat(match[2]);
      if (Number.isFinite(value)) {
        map.set(match[1], value);
      }
    }

    return map;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private extractReadableTextFromPdfNode(rootNode: Node): string {
    const walk = (node: Node): string => {
      if (node.type === 'text') {
        return (node as unknown as { data?: string }).data || '';
      }

      if (node.type !== 'tag') {
        return '';
      }

      const element = node as Element;
      const classList = (element.attribs?.class || '').split(/\s+/).filter(Boolean);
      const isPdfSpaceCarrier = classList.some(
        (className) => className === '_' || /^_[a-z0-9]+$/i.test(className),
      );

      if (element.name === 'br') {
        return ' ';
      }

      let output = '';
      for (const child of element.children || []) {
        output += walk(child);
      }

      if (!output && isPdfSpaceCarrier) {
        return ' ';
      }

      return output;
    };

    return walk(rootNode).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
