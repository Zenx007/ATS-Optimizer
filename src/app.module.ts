import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAiModule } from './openai/openai.module';
import { PdfModule } from './pdf/pdf.module';
import { ResumeModule } from './resume/resume.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    OpenAiModule,
    PdfModule,
    ResumeModule,
  ],
})
export class AppModule {}
