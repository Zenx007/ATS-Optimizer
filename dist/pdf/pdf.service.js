"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PdfService = void 0;
const common_1 = require("@nestjs/common");
const cheerio_1 = require("cheerio");
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const puppeteer_1 = __importDefault(require("puppeteer"));
let PdfService = class PdfService {
    async convertPdfBufferToHtml(pdfBuffer) {
        if (!pdfBuffer?.length) {
            throw new common_1.BadRequestException('Arquivo PDF vazio ou inválido.');
        }
        const parsed = await (0, pdf_parse_1.default)(pdfBuffer);
        const text = parsed.text?.trim();
        if (!text) {
            throw new common_1.BadRequestException('Não foi possível extrair texto do PDF.');
        }
        return this.textToHtml(text);
    }
    async convertHtmlToPdfBuffer(html) {
        if (!this.isValidHtml(html)) {
            throw new common_1.BadRequestException('HTML otimizado inválido para geração de PDF.');
        }
        const browser = await puppeteer_1.default.launch({
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
        }
        finally {
            await browser.close();
        }
    }
    isValidHtml(html) {
        if (!html || typeof html !== 'string') {
            return false;
        }
        const hasTag = /<\s*([a-z][a-z0-9]*)\b[^>]*>/i.test(html);
        if (!hasTag) {
            return false;
        }
        const $ = (0, cheerio_1.load)(html);
        const extractedText = $.root().text().trim();
        return extractedText.length > 0;
    }
    textToHtml(text) {
        const normalized = text
            .replace(/\r\n/g, '\n')
            .replace(/\u0000/g, '')
            .replace(/\t/g, ' ')
            .trim();
        const blocks = normalized
            .split(/\n{2,}/)
            .map((chunk) => chunk.trim())
            .filter(Boolean);
        const htmlBlocks = [];
        for (const block of blocks) {
            const lines = block
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);
            if (!lines.length) {
                continue;
            }
            const isBulletList = lines.every((line) => /^[-•*]\s+/.test(line));
            if (isBulletList) {
                const items = lines
                    .map((line) => line.replace(/^[-•*]\s+/, ''))
                    .map((line) => `<li>${this.escapeHtml(line)}</li>`)
                    .join('');
                htmlBlocks.push(`<ul>${items}</ul>`);
                continue;
            }
            if (this.isHeadingCandidate(lines)) {
                htmlBlocks.push(`<h2>${this.escapeHtml(lines.join(' '))}</h2>`);
                continue;
            }
            htmlBlocks.push(`<p>${this.escapeHtml(lines.join(' '))}</p>`);
        }
        const body = htmlBlocks.join('\n');
        return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Currículo</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        font-size: 12pt;
        line-height: 1.45;
        color: #111;
      }
      h1, h2, h3 {
        margin: 14px 0 8px;
      }
      p {
        margin: 0 0 8px;
      }
      ul {
        margin: 0 0 10px 20px;
        padding: 0;
      }
      li {
        margin-bottom: 4px;
      }
    </style>
  </head>
  <body>
${body}
  </body>
</html>`;
    }
    isHeadingCandidate(lines) {
        if (lines.length > 1) {
            return false;
        }
        const line = lines[0];
        const wordCount = line.split(/\s+/).length;
        if (wordCount > 8 || line.length > 70) {
            return false;
        }
        const hasTerminalPunctuation = /[.!?;:]$/.test(line);
        return !hasTerminalPunctuation;
    }
    escapeHtml(value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};
exports.PdfService = PdfService;
exports.PdfService = PdfService = __decorate([
    (0, common_1.Injectable)()
], PdfService);
//# sourceMappingURL=pdf.service.js.map