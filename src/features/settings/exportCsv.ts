import { Platform } from 'react-native';

/**
 * Hands a CSV text to the user: a download on web, the share sheet on native (file written to the cache folder,
 * which the system may clear). The text is exactly what `transactionsToCsv` produced, plus a UTF-8 BOM so
 * spreadsheet apps read accented characters correctly.
 */
export async function shareCsv(csv: string, filename: string, dialogTitle: string): Promise<void> {
  const content = `﻿${csv}`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(url);
    }
    return;
  }
  const [{ File, Paths }, Sharing] = await Promise.all([import('expo-file-system'), import('expo-sharing')]);
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle,
      UTI: 'public.comma-separated-values-text',
    });
  }
}
