export declare class PdfService {
    convertPdfBufferToHtml(pdfBuffer: Buffer): Promise<string>;
    convertHtmlToPdfBuffer(html: string): Promise<Buffer>;
    isValidHtml(html: string): boolean;
    private textToHtml;
    private isHeadingCandidate;
    private escapeHtml;
}
