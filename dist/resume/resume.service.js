"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResumeService = void 0;
const common_1 = require("@nestjs/common");
const node_fs_1 = require("node:fs");
const path = __importStar(require("node:path"));
const uuid_1 = require("uuid");
const openai_service_1 = require("../openai/openai.service");
const pdf_service_1 = require("../pdf/pdf.service");
let ResumeService = class ResumeService {
    constructor(pdfService, openAiService) {
        this.pdfService = pdfService;
        this.openAiService = openAiService;
        this.storageRoot = path.join(process.cwd(), 'storage', 'resumes');
    }
    async uploadResume(file) {
        await this.ensureStorageRoot();
        const resumeId = (0, uuid_1.v4)();
        const resumeDir = this.getResumeDirectory(resumeId);
        await node_fs_1.promises.mkdir(resumeDir, { recursive: true });
        const originalPdfPath = path.join(resumeDir, 'original.pdf');
        await node_fs_1.promises.writeFile(originalPdfPath, file.buffer);
        const originalHtml = await this.pdfService.convertPdfBufferToHtml(file.buffer);
        const originalHtmlPath = path.join(resumeDir, 'original.html');
        await node_fs_1.promises.writeFile(originalHtmlPath, originalHtml, 'utf-8');
        const now = new Date().toISOString();
        const record = {
            id: resumeId,
            createdAt: now,
            updatedAt: now,
            originalPdfPath,
            originalHtmlPath,
        };
        await this.saveMetadata(record);
        return {
            resumeId,
            originalHtml,
        };
    }
    async reconvertPdfToHtml(id) {
        const record = await this.getRecordOrFail(id);
        const pdfBuffer = await node_fs_1.promises.readFile(record.originalPdfPath);
        const originalHtml = await this.pdfService.convertPdfBufferToHtml(pdfBuffer);
        await node_fs_1.promises.writeFile(record.originalHtmlPath, originalHtml, 'utf-8');
        record.updatedAt = new Date().toISOString();
        await this.saveMetadata(record);
        return {
            resumeId: id,
            originalHtml,
        };
    }
    async optimizeResume(id, { jobDescription, immutableData }) {
        const record = await this.getRecordOrFail(id);
        const originalHtml = await node_fs_1.promises.readFile(record.originalHtmlPath, 'utf-8');
        const optimizedHtml = await this.openAiService.optimizeResume({
            resumeHtml: originalHtml,
            jobDescription,
            immutableData,
        });
        if (!this.pdfService.isValidHtml(optimizedHtml)) {
            throw new common_1.UnprocessableEntityException('O HTML otimizado retornado pela IA está inválido.');
        }
        const optimizedHtmlPath = path.join(this.getResumeDirectory(id), 'optimized.html');
        await node_fs_1.promises.writeFile(optimizedHtmlPath, optimizedHtml, 'utf-8');
        record.jobDescription = jobDescription;
        record.immutableData = immutableData;
        record.optimizedHtmlPath = optimizedHtmlPath;
        record.updatedAt = new Date().toISOString();
        await this.saveMetadata(record);
        return {
            resumeId: id,
            optimizedHtml,
        };
    }
    async generateFinalPdf(id) {
        const record = await this.getRecordOrFail(id);
        if (!record.optimizedHtmlPath) {
            throw new common_1.UnprocessableEntityException('Não existe HTML otimizado. Execute a otimização antes de gerar o PDF final.');
        }
        const optimizedHtml = await node_fs_1.promises.readFile(record.optimizedHtmlPath, 'utf-8');
        const finalPdfBuffer = await this.pdfService.convertHtmlToPdfBuffer(optimizedHtml);
        const finalPdfPath = path.join(this.getResumeDirectory(id), 'optimized.pdf');
        await node_fs_1.promises.writeFile(finalPdfPath, finalPdfBuffer);
        record.finalPdfPath = finalPdfPath;
        record.updatedAt = new Date().toISOString();
        await this.saveMetadata(record);
        return {
            resumeId: id,
            downloadUrl: `/resumes/${id}/download-pdf`,
            fileName: `ats-optimized-${id}.pdf`,
        };
    }
    async getOptimizedHtml(id) {
        const record = await this.getRecordOrFail(id);
        if (!record.optimizedHtmlPath) {
            throw new common_1.UnprocessableEntityException('Currículo ainda não foi otimizado para ATS.');
        }
        const optimizedHtml = await node_fs_1.promises.readFile(record.optimizedHtmlPath, 'utf-8');
        return {
            resumeId: id,
            optimizedHtml,
        };
    }
    async getFinalPdfFile(id) {
        const record = await this.getRecordOrFail(id);
        if (!record.finalPdfPath) {
            throw new common_1.UnprocessableEntityException('PDF final não encontrado. Gere o PDF otimizado primeiro.');
        }
        return {
            filePath: record.finalPdfPath,
            fileName: `ats-optimized-${id}.pdf`,
        };
    }
    async getRecordOrFail(id) {
        const metadataPath = this.getMetadataPath(id);
        let metadataRaw;
        try {
            metadataRaw = await node_fs_1.promises.readFile(metadataPath, 'utf-8');
        }
        catch {
            throw new common_1.NotFoundException('Currículo não encontrado para o ID informado.');
        }
        return JSON.parse(metadataRaw);
    }
    async saveMetadata(record) {
        const metadataPath = this.getMetadataPath(record.id);
        await node_fs_1.promises.writeFile(metadataPath, JSON.stringify(record, null, 2), 'utf-8');
    }
    async ensureStorageRoot() {
        await node_fs_1.promises.mkdir(this.storageRoot, { recursive: true });
    }
    getResumeDirectory(id) {
        return path.join(this.storageRoot, id);
    }
    getMetadataPath(id) {
        return path.join(this.getResumeDirectory(id), 'metadata.json');
    }
};
exports.ResumeService = ResumeService;
exports.ResumeService = ResumeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [pdf_service_1.PdfService,
        openai_service_1.OpenAiService])
], ResumeService);
//# sourceMappingURL=resume.service.js.map