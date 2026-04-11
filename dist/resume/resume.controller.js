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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResumeController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const optimize_resume_dto_1 = require("./dto/optimize-resume.dto");
const resume_service_1 = require("./resume.service");
let ResumeController = class ResumeController {
    constructor(resumeService) {
        this.resumeService = resumeService;
    }
    async uploadResume(file) {
        if (!file) {
            throw new common_1.BadRequestException('Arquivo PDF não enviado.');
        }
        return this.resumeService.uploadResume(file);
    }
    async reconvertPdfToHtml(id) {
        return this.resumeService.reconvertPdfToHtml(id);
    }
    async optimizeResume(id, body) {
        return this.resumeService.optimizeResume(id, body);
    }
    async generateFinalPdf(id) {
        return this.resumeService.generateFinalPdf(id);
    }
    async getOptimizedHtml(id) {
        return this.resumeService.getOptimizedHtml(id);
    }
    async downloadFinalPdf(id, res) {
        const { filePath, fileName } = await this.resumeService.getFinalPdfFile(id);
        res.download(filePath, fileName);
    }
};
exports.ResumeController = ResumeController;
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.memoryStorage)(),
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (_req, file, callback) => {
            const isPdfMime = file.mimetype === 'application/pdf';
            const isPdfName = file.originalname.toLowerCase().endsWith('.pdf');
            if (isPdfMime && isPdfName) {
                callback(null, true);
                return;
            }
            callback(new common_1.BadRequestException('Envie apenas arquivos PDF válidos.'), false);
        },
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ResumeController.prototype, "uploadResume", null);
__decorate([
    (0, common_1.Post)(':id/convert-pdf-to-html'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ResumeController.prototype, "reconvertPdfToHtml", null);
__decorate([
    (0, common_1.Post)(':id/optimize'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, optimize_resume_dto_1.OptimizeResumeDto]),
    __metadata("design:returntype", Promise)
], ResumeController.prototype, "optimizeResume", null);
__decorate([
    (0, common_1.Post)(':id/generate-pdf'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ResumeController.prototype, "generateFinalPdf", null);
__decorate([
    (0, common_1.Get)(':id/optimized-html'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ResumeController.prototype, "getOptimizedHtml", null);
__decorate([
    (0, common_1.Get)(':id/download-pdf'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ResumeController.prototype, "downloadFinalPdf", null);
exports.ResumeController = ResumeController = __decorate([
    (0, common_1.Controller)('resumes'),
    __metadata("design:paramtypes", [resume_service_1.ResumeService])
], ResumeController);
//# sourceMappingURL=resume.controller.js.map