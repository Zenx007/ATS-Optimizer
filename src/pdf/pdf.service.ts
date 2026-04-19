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
        '1',
        '--embed-image',
        '1',
        '--embed-javascript',
        '1',
        '--embed-outline',
        '1',
        '--printing',
        '1',
        inputPdfPath,
        outputHtmlFilename,
      ]);

      const html = await fs.readFile(outputHtmlPath, 'utf-8');
      if (!this.hasAnyHtmlTag(html)) {
        throw new BadRequestException(
          'A conversão com pdf2htmlEX não gerou HTML válido.',
        );
      }

      return html;
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
}
