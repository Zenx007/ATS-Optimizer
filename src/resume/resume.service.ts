import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { OpenAiService } from '../openai/openai.service';
import { PdfService } from '../pdf/pdf.service';
import { ResumeRecord } from '../common/interfaces/resume-record.interface';
import { OptimizeResumeDto } from './dto/optimize-resume.dto';

export interface UploadResult {
  resumeId: string;
  originalHtml: string;
}

@Injectable()
export class ResumeService {
  private readonly storageRoot = path.join(process.cwd(), 'storage', 'resumes');

  constructor(
    private readonly pdfService: PdfService,
    private readonly openAiService: OpenAiService,
  ) {}

  async uploadResume(file: Express.Multer.File): Promise<UploadResult> {
    await this.ensureStorageRoot();

    const resumeId = uuidv4();
    const resumeDir = this.getResumeDirectory(resumeId);
    await fs.mkdir(resumeDir, { recursive: true });

    const originalPdfPath = path.join(resumeDir, 'original.pdf');
    await fs.writeFile(originalPdfPath, file.buffer);

    const originalHtml = await this.pdfService.convertPdfBufferToHtml(file.buffer);
    const originalHtmlPath = path.join(resumeDir, 'original.html');
    await fs.writeFile(originalHtmlPath, originalHtml, 'utf-8');

    const now = new Date().toISOString();
    const record: ResumeRecord = {
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

  async reconvertPdfToHtml(id: string): Promise<{ resumeId: string; originalHtml: string }> {
    const record = await this.getRecordOrFail(id);

    const pdfBuffer = await fs.readFile(record.originalPdfPath);
    const originalHtml = await this.pdfService.convertPdfBufferToHtml(pdfBuffer);

    await fs.writeFile(record.originalHtmlPath, originalHtml, 'utf-8');

    record.updatedAt = new Date().toISOString();
    await this.saveMetadata(record);

    return {
      resumeId: id,
      originalHtml,
    };
  }

  async optimizeResume(
    id: string,
    { jobDescription, immutableData }: OptimizeResumeDto,
  ): Promise<{ resumeId: string; optimizedHtml: string }> {
    const record = await this.getRecordOrFail(id);

    const originalHtml = await fs.readFile(record.originalHtmlPath, 'utf-8');

    const optimizedHtml = await this.openAiService.optimizeResume({
      resumeHtml: originalHtml,
      jobDescription,
      immutableData,
    });

    if (!this.pdfService.isValidHtml(optimizedHtml)) {
      throw new UnprocessableEntityException(
        'O HTML otimizado retornado pela IA está inválido.',
      );
    }

    const optimizedHtmlPath = path.join(this.getResumeDirectory(id), 'optimized.html');
    await fs.writeFile(optimizedHtmlPath, optimizedHtml, 'utf-8');

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

  async generateFinalPdf(
    id: string,
  ): Promise<{ resumeId: string; downloadUrl: string; fileName: string }> {
    const record = await this.getRecordOrFail(id);

    if (!record.optimizedHtmlPath) {
      throw new UnprocessableEntityException(
        'Não existe HTML otimizado. Execute a otimização antes de gerar o PDF final.',
      );
    }

    const optimizedHtml = await fs.readFile(record.optimizedHtmlPath, 'utf-8');
    const finalPdfBuffer = await this.pdfService.convertHtmlToPdfBuffer(optimizedHtml);

    const finalPdfPath = path.join(this.getResumeDirectory(id), 'optimized.pdf');
    await fs.writeFile(finalPdfPath, finalPdfBuffer);

    record.finalPdfPath = finalPdfPath;
    record.updatedAt = new Date().toISOString();
    await this.saveMetadata(record);

    return {
      resumeId: id,
      downloadUrl: `/resumes/${id}/download-pdf`,
      fileName: `ats-optimized-${id}.pdf`,
    };
  }

  async getOptimizedHtml(id: string): Promise<{ resumeId: string; optimizedHtml: string }> {
    const record = await this.getRecordOrFail(id);

    if (!record.optimizedHtmlPath) {
      throw new UnprocessableEntityException(
        'Currículo ainda não foi otimizado para ATS.',
      );
    }

    const optimizedHtml = await fs.readFile(record.optimizedHtmlPath, 'utf-8');

    return {
      resumeId: id,
      optimizedHtml,
    };
  }

  async getFinalPdfFile(id: string): Promise<{ filePath: string; fileName: string }> {
    const record = await this.getRecordOrFail(id);

    if (!record.finalPdfPath) {
      throw new UnprocessableEntityException(
        'PDF final não encontrado. Gere o PDF otimizado primeiro.',
      );
    }

    return {
      filePath: record.finalPdfPath,
      fileName: `ats-optimized-${id}.pdf`,
    };
  }

  private async getRecordOrFail(id: string): Promise<ResumeRecord> {
    const metadataPath = this.getMetadataPath(id);

    let metadataRaw: string;
    try {
      metadataRaw = await fs.readFile(metadataPath, 'utf-8');
    } catch {
      throw new NotFoundException('Currículo não encontrado para o ID informado.');
    }

    return JSON.parse(metadataRaw) as ResumeRecord;
  }

  private async saveMetadata(record: ResumeRecord): Promise<void> {
    const metadataPath = this.getMetadataPath(record.id);
    await fs.writeFile(metadataPath, JSON.stringify(record, null, 2), 'utf-8');
  }

  private async ensureStorageRoot(): Promise<void> {
    await fs.mkdir(this.storageRoot, { recursive: true });
  }

  private getResumeDirectory(id: string): string {
    return path.join(this.storageRoot, id);
  }

  private getMetadataPath(id: string): string {
    return path.join(this.getResumeDirectory(id), 'metadata.json');
  }
}
