import { createHash } from 'node:crypto';

import PDFDocument from 'pdfkit';

import {
  formatReportValue,
  normalizeReportFilename,
  normalizeReportGeneratedAt,
  type ReportArtifact,
  type ReportArtifactInput,
} from './report-artifact';

export async function createPdfReportArtifact(
  input: ReportArtifactInput,
): Promise<ReportArtifact> {
  const generatedAt = normalizeReportGeneratedAt(input.generatedAt);
  const content = await renderPdf(input, generatedAt);

  return {
    filename: normalizeReportFilename(input, 'pdf'),
    contentType: 'application/pdf',
    byteLength: content.length,
    checksumSha256: createHash('sha256').update(content).digest('hex'),
    generatedAt,
    rowCount: input.rows.length,
    content,
  };
}

function renderPdf(input: ReportArtifactInput, generatedAt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const document = new PDFDocument({
      autoFirstPage: true,
      bufferPages: false,
      compress: false,
      margin: 40,
      size: 'A4',
      info: {
        Title: input.title,
        Author: 'Shule Hub',
        Subject: input.reportId,
        CreationDate: new Date(generatedAt),
        ModDate: new Date(generatedAt),
      },
    });

    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));

    document.fontSize(18).text(input.title.trim() || input.reportId, { continued: false });
    document.moveDown(0.5);
    document.fontSize(9).text(`Generated at: ${generatedAt}`);
    document.text(`Rows: ${input.rows.length}`);
    document.text(`Filters: ${JSON.stringify(input.filters ?? {})}`);
    document.moveDown();

    document.fontSize(10).font('Helvetica-Bold').text(input.headers.join(' | '));
    document.font('Helvetica');

    for (const row of input.rows) {
      document.text(row.map(formatReportValue).join(' | '), {
        lineGap: 2,
      });
    }

    document.end();
  });
}
