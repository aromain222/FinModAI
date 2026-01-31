import { PDFDocument, rgb } from 'pdf-lib';

export async function createReportPdf(content: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  
  page.drawText('Financial Model Report', {
    x: 50,
    y: 750,
    size: 20,
    color: rgb(0, 0, 0)
  });
  
  page.drawText(content.substring(0, 500), {
    x: 50,
    y: 700,
    size: 10,
    color: rgb(0, 0, 0)
  });
  
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
