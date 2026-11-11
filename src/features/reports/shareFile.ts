import { Platform } from 'react-native';

export type ShareResult = 'shared' | 'downloaded' | 'unavailable';

/**
 * Hands a CSV text to the user: a browser download on web; on the phone a cache file opened in the share sheet.
 * A UTF-8 byte order mark makes spreadsheet apps read accents correctly. Nothing is uploaded anywhere.
 */
export async function shareCsv(filename: string, content: string): Promise<ShareResult> {
  const text = `﻿${content}`;
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return 'unavailable';
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  }
  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: filename,
  });
  return 'shared';
}
