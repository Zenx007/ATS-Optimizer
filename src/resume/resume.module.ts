import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { PdfModule } from '../pdf/pdf.module';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';

@Module({
  imports: [PdfModule, GeminiModule],
  controllers: [ResumeController],
  providers: [ResumeService],
})
export class ResumeModule {}
