// Download und Teilen (Web Share API) der erzeugten PDF-Datei.
export function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function canShareFiles() {
  try {
    const f = new File([new Uint8Array(1)], 'x.pdf', { type: 'application/pdf' });
    return !!navigator.canShare?.({ files: [f] });
  } catch {
    return false;
  }
}

export async function shareBytes(bytes, filename) {
  const file = new File([bytes], filename, { type: 'application/pdf' });
  await navigator.share({ files: [file], title: filename });
}
