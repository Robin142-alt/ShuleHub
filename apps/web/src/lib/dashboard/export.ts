export interface PrintableRow {
  label: string;
  value: string;
  tone?: "default" | "danger";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeCsv(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

export function downloadCsvFile({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: string[][];
}) {
  if (typeof window === "undefined") {
    return;
  }

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => escapeCsv(value)).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");

  link.href = url;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function downloadTextFile({
  filename,
  content,
  mimeType = "text/plain;charset=utf-8;",
}: {
  filename: string;
  content: string;
  mimeType?: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");

  link.href = url;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  const textarea = window.document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  window.document.body.appendChild(textarea);
  textarea.select();
  window.document.execCommand("copy");
  window.document.body.removeChild(textarea);
}

export function openPrintDocument({
  eyebrow,
  title,
  subtitle,
  rows,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  rows: PrintableRow[];
  footer: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");

  if (!popup) {
    return;
  }

  const renderedRows = rows
    .map(
      (row) => `
        <div class="row">
          <div class="label">${escapeHtml(row.label)}</div>
          <div class="value ${row.tone === "danger" ? "danger" : ""}">${escapeHtml(row.value)}</div>
        </div>
      `,
    )
    .join("");

  popup.document.write(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            margin: 0;
            font-family: Inter, Segoe UI, Arial, sans-serif;
            background: #f8fafc;
            color: #0f172a;
          }
          .page {
            max-width: 820px;
            margin: 24px auto;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 32px;
            box-sizing: border-box;
          }
          .eyebrow {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            color: #64748b;
          }
          h1 {
            margin: 12px 0 0;
            font-size: 24px;
            line-height: 1.2;
          }
          .subtitle {
            margin: 12px 0 0;
            font-size: 14px;
            line-height: 1.7;
            color: #64748b;
          }
          .divider {
            margin: 20px 0;
            border-top: 1px solid #e2e8f0;
          }
          .row {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            padding: 12px 0;
            border-bottom: 1px solid #e2e8f0;
          }
          .row:last-child {
            border-bottom: none;
          }
          .label,
          .value {
            font-size: 14px;
            line-height: 1.5;
          }
          .value {
            font-weight: 700;
            text-align: right;
          }
          .danger {
            color: #dc2626;
          }
          .footer {
            margin-top: 20px;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            background: #f8fafc;
            padding: 16px;
            font-size: 14px;
            line-height: 1.7;
            color: #64748b;
          }
          @media print {
            body {
              background: #ffffff;
            }
            .page {
              margin: 0;
              border: none;
              border-radius: 0;
              max-width: none;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <main class="page">
          <div class="eyebrow">${escapeHtml(eyebrow)}</div>
          <h1>${escapeHtml(title)}</h1>
          <p class="subtitle">${escapeHtml(subtitle)}</p>
          <div class="divider"></div>
          ${renderedRows}
          <div class="footer">${escapeHtml(footer)}</div>
        </main>
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
}
