import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { OptimizeResumeDto } from './dto/optimize-resume.dto';
import { ResumeService } from './resume.service';

@Controller('resumes')
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        const isPdfMime = file.mimetype === 'application/pdf';
        const isPdfName = file.originalname.toLowerCase().endsWith('.pdf');

        if (isPdfMime && isPdfName) {
          callback(null, true);
          return;
        }

        callback(new BadRequestException('Envie apenas arquivos PDF válidos.'), false);
      },
    }),
  )
  async uploadResume(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Arquivo PDF não enviado.');
    }

    return this.resumeService.uploadResume(file);
  }

  @Post(':id/convert-pdf-to-html')
  async reconvertPdfToHtml(@Param('id') id: string) {
    return this.resumeService.reconvertPdfToHtml(id);
  }

  @Post(':id/optimize')
  async optimizeResume(@Param('id') id: string, @Body() body: OptimizeResumeDto) {
    return this.resumeService.optimizeResume(id, body);
  }

  @Post(':id/generate-pdf')
  async generateFinalPdf(@Param('id') id: string) {
    return this.resumeService.generateFinalPdf(id);
  }

  @Get(':id/optimized-html')
  async getOptimizedHtml(@Param('id') id: string) {
    return this.resumeService.getOptimizedHtml(id);
  }

  @Get(':id/download-pdf')
  async downloadFinalPdf(@Param('id') id: string, @Res() res: Response) {
    const { filePath, fileName } = await this.resumeService.getFinalPdfFile(id);
    res.download(filePath, fileName);
  }
}
