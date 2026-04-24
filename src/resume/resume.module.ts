import { Module } from '@nestjs/common';
import { OpenRouterModule } from '../openrouter/openrouter.module';
import { PdfModule } from '../pdf/pdf.module';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';

@Module({
  imports: [PdfModule, OpenRouterModule],
  controllers: [ResumeController],
  providers: [ResumeService],
})
export class ResumeModule {}
