// Read just the header to route local files without trusting the filename or MIME type.
export function plannerFileKind(header, size, name, mime) {
  if (!size || size > 64 * 1024 * 1024) throw Error('Choose a nonempty drawing up to 64 MB or a saved project up to 5 MB.');
  const has = (offset, signature) => signature.every((byte, i) => header[offset + i] === byte);
  if (has(0, [137,80,78,71,13,10,26,10])) return 'png';
  if (has(0, [255,216,255])) return 'jpeg';
  if (has(0, [82,73,70,70]) && has(8, [87,69,66,80])) return 'webp';
  const text = String.fromCharCode(...header).replace(/^\xEF\xBB\xBF/, '').trimStart();
  if (!text.startsWith('{') && (/^%PDF-\d+\.\d+/.test(text) ||
      ((/\.pdf$/i.test(name) || mime === 'application/pdf') && /%PDF-\d+\.\d+/.test(text)))) return 'pdf';
  if (text.startsWith('{') || /\.json$/i.test(name) || mime === 'application/json') {
    if (size > 5e6) throw Error('The saved project exceeds the 5 MB limit.');
    return 'project';
  }
  throw Error('Choose a PDF, PNG, JPEG, WebP or saved roof project (.json).');
}
