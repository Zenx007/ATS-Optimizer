import { Module } from '@nestjs/common';
import { OpenAiModule } from '../openai/openai.module';
import { PdfModule } from '../pdf/pdf.module';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';

@Module({
  imports: [PdfModule, OpenAiModule],
  controllers: [ResumeController],
  providers: [ResumeService],
})
export class ResumeModule {}
