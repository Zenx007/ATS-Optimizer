import type { Response } from 'express';
import { OptimizeResumeDto } from './dto/optimize-resume.dto';
import { ResumeService } from './resume.service';
export declare class ResumeController {
    private readonly resumeService;
    constructor(resumeService: ResumeService);
    uploadResume(file?: Express.Multer.File): Promise<import("./resume.service").UploadResult>;
    reconvertPdfToHtml(id: string): Promise<{
        resumeId: string;
        originalHtml: string;
    }>;
    optimizeResume(id: string, body: OptimizeResumeDto): Promise<{
        resumeId: string;
        optimizedHtml: string;
    }>;
    generateFinalPdf(id: string): Promise<{
        resumeId: string;
        downloadUrl: string;
        fileName: string;
    }>;
    getOptimizedHtml(id: string): Promise<{
        resumeId: string;
        optimizedHtml: string;
    }>;
    downloadFinalPdf(id: string, res: Response): Promise<void>;
}
