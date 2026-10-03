export type PreparedPdfDownload = { url: string; filename: string };

/** Keep a native, connected download link alive until the browser takes the file. */
export function savePdfDownload(bytes: ArrayBuffer, filename: string, onPrepared?: (file: PreparedPdfDownload) => void): void {
  const url = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } catch (error) {
    anchor.remove();
    URL.revokeObjectURL(url);
    throw error;
  }
  if (onPrepared) {
    anchor.remove();
    onPrepared({url, filename});
    return;
  }
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 60000);
}
