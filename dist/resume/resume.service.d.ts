import { OpenAiService } from '../openai/openai.service';
import { PdfService } from '../pdf/pdf.service';
import { OptimizeResumeDto } from './dto/optimize-resume.dto';
export interface UploadResult {
    resumeId: string;
    originalHtml: string;
}
export declare class ResumeService {
    private readonly pdfService;
    private readonly openAiService;
    private readonly storageRoot;
    constructor(pdfService: PdfService, openAiService: OpenAiService);
    uploadResume(file: Express.Multer.File): Promise<UploadResult>;
    reconvertPdfToHtml(id: string): Promise<{
        resumeId: string;
        originalHtml: string;
    }>;
    optimizeResume(id: string, { jobDescription, immutableData }: OptimizeResumeDto): Promise<{
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
    getFinalPdfFile(id: string): Promise<{
        filePath: string;
        fileName: string;
    }>;
    private getRecordOrFail;
    private saveMetadata;
    private ensureStorageRoot;
    private getResumeDirectory;
    private getMetadataPath;
}
