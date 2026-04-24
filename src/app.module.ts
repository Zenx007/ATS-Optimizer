import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenRouterModule } from './openrouter/openrouter.module';
import { PdfModule } from './pdf/pdf.module';
import { ResumeModule } from './resume/resume.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    OpenRouterModule,
    PdfModule,
    ResumeModule,
  ],
})
export class AppModule {}
