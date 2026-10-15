import PDFDocument from "pdfkit";

export type PdfTableColumn = { label: string; width: number; align?: "left" | "center" | "right" };
export type PdfTable = { title: string; columns: PdfTableColumn[]; rows: string[][]; emptyText?: string };
export type PdfReport = {
  title: string;
  generatedAt: Date;
  filters: string[];
  totals: Array<[string, string]>;
  tables: PdfTable[];
  logoPath?: string;
};

const colors = { navy: "#17365d", blue: "#285fdb", pale: "#edf3ff", line: "#ccd5e1", muted: "#607086", text: "#24334a", white: "#ffffff" };
const margin = 36;
const footerHeight = 25;

export async function createPdfReport(report: PdfReport): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margins: { top: margin, bottom: margin + footerHeight, left: margin, right: margin }, bufferPages: true, info: { Title: report.title, Author: "Dizon's Petshop", Subject: "Administrative report" } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawReportHeader(doc, report);
  drawTotals(doc, report.totals);
  for (const table of report.tables) drawTable(doc, table);
  addPageNumbers(doc);
  doc.end();
  return completed;
}

function drawReportHeader(doc: PDFKit.PDFDocument, report: PdfReport) {
  const top = doc.y;
  if (report.logoPath) {
    try { doc.image(report.logoPath, margin, top, { fit: [48, 48], align: "center", valign: "center" }); } catch { /* The system name remains visible if the optional image cannot be read. */ }
  }
  doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(16).text("DIZON'S PETSHOP", margin + 60, top + 2);
  doc.fillColor(colors.blue).fontSize(13).text(report.title, margin + 60, top + 23);
  const generated = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Manila" }).format(report.generatedAt);
  doc.fillColor(colors.muted).font("Helvetica").fontSize(8).text(`Generated: ${generated}`, 520, top + 5, { width: 285, align: "right" });
  doc.text(`Filters: ${report.filters.length ? report.filters.join(" | ") : "None"}`, 420, top + 24, { width: 385, align: "right" });
  doc.moveTo(margin, top + 57).lineTo(doc.page.width - margin, top + 57).strokeColor(colors.line).lineWidth(1).stroke();
  doc.y = top + 70;
}

function drawTotals(doc: PDFKit.PDFDocument, totals: Array<[string, string]>) {
  if (!totals.length) return;
  const gap = 8;
  const width = (doc.page.width - margin * 2 - gap * (totals.length - 1)) / totals.length;
  const y = doc.y;
  totals.forEach(([label, value], index) => {
    const x = margin + index * (width + gap);
    doc.roundedRect(x, y, width, 42, 4).fill(colors.pale);
    doc.fillColor(colors.muted).font("Helvetica-Bold").fontSize(7).text(label.toUpperCase(), x + 9, y + 8, { width: width - 18 });
    doc.fillColor(colors.navy).fontSize(12).text(value, x + 9, y + 22, { width: width - 18 });
  });
  doc.y = y + 55;
}

function drawTable(doc: PDFKit.PDFDocument, table: PdfTable) {
  ensureSpace(doc, 55);
  doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(11).text(table.title, margin, doc.y, { width: doc.page.width - margin * 2 });
  doc.moveDown(0.45);
  if (!table.rows.length) {
    doc.fillColor(colors.muted).font("Helvetica-Oblique").fontSize(8).text(table.emptyText || "No records matched the selected filters.", margin, doc.y);
    doc.moveDown(1.2);
    return;
  }

  drawTableHeader(doc, table.columns);
  table.rows.forEach((row, rowIndex) => {
    doc.font("Helvetica").fontSize(7);
    const heights = table.columns.map((column, index) => doc.heightOfString(cleanCell(row[index]), { width: column.width - 8, align: column.align || "left" }));
    const rowHeight = Math.max(20, ...heights.map((height) => height + 8));
    if (doc.y + rowHeight > pageBottom(doc)) {
      doc.addPage();
      drawTableHeader(doc, table.columns);
    }
    const y = doc.y;
    if (rowIndex % 2) doc.rect(margin, y, table.columns.reduce((sum, column) => sum + column.width, 0), rowHeight).fill("#f8fafc");
    let x = margin;
    table.columns.forEach((column, index) => {
      doc.rect(x, y, column.width, rowHeight).strokeColor(colors.line).lineWidth(0.4).stroke();
      doc.fillColor(colors.text).font("Helvetica").fontSize(7).text(cleanCell(row[index]), x + 4, y + 5, { width: column.width - 8, height: rowHeight - 8, align: column.align || "left" });
      x += column.width;
    });
    doc.y = y + rowHeight;
  });
  doc.y += 16;
}

function drawTableHeader(doc: PDFKit.PDFDocument, columns: PdfTableColumn[]) {
  const height = 23;
  const y = doc.y;
  let x = margin;
  columns.forEach((column) => {
    doc.rect(x, y, column.width, height).fillAndStroke(colors.navy, colors.navy);
    doc.fillColor(colors.white).font("Helvetica-Bold").fontSize(7).text(column.label, x + 4, y + 7, { width: column.width - 8, align: column.align || "left" });
    x += column.width;
  });
  doc.y = y + height;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > pageBottom(doc)) doc.addPage();
}

function pageBottom(doc: PDFKit.PDFDocument) {
  return doc.page.height - margin - footerHeight;
}

function cleanCell(value?: string) {
  return String(value ?? "—").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() || "—";
}

function addPageNumbers(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    const y = doc.page.height - 30;
    doc.moveTo(margin, y - 5).lineTo(doc.page.width - margin, y - 5).strokeColor(colors.line).lineWidth(0.5).stroke();
    doc.fillColor(colors.muted).font("Helvetica").fontSize(7).text("Dizon's Petshop • Confidential administrative report", margin, y, { width: 430, lineBreak: false });
    doc.text(`Page ${index - range.start + 1} of ${range.count}`, doc.page.width - margin - 160, y, { width: 160, align: "right", lineBreak: false });
  }
}
