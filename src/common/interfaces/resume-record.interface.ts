export interface ResumeRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  originalPdfPath: string;
  originalHtmlPath: string;
  jobDescription?: string;
  immutableData?: string;
  optimizedHtmlPath?: string;
  finalPdfPath?: string;
}
