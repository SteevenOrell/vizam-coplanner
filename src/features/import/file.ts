import { Platform } from 'react-native';

import { base64ToBytes, decodeBytes } from '../../domain/import/csv';
import { ImportLimitError, MAX_IMPORT_BYTES } from '../../domain/import/types';

export interface PickedFile {
  name: string;
  text: string;
}

/** Web: a hidden <input type="file"> clicked from the tap handler. Resolves null when the dialog is cancelled. */
function pickWeb(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,text/plain';
    input.style.display = 'none';
    const done = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Lets the person choose a bank export and returns its decoded text (UTF-8, or Windows-1252 when the bytes are not
 * valid UTF-8). Returns null if they cancel. Throws ImportLimitError('tooLarge') above 5 MB, before reading.
 */
export async function pickBankFile(): Promise<PickedFile | null> {
  if (Platform.OS === 'web') {
    const file = await pickWeb();
    if (!file) return null;
    if (file.size > MAX_IMPORT_BYTES) throw new ImportLimitError('tooLarge');
    return { name: file.name, text: decodeBytes(new Uint8Array(await file.arrayBuffer())) };
  }
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'text/csv',
      'text/comma-separated-values',
      'text/plain',
      'application/csv',
      'application/vnd.ms-excel',
      // Some Android file managers report CSV exports as a generic binary type.
      'application/octet-stream',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  if (asset.size !== undefined && asset.size > MAX_IMPORT_BYTES) throw new ImportLimitError('tooLarge');
  const { File: NativeFile } = await import('expo-file-system');
  const base64 = await new NativeFile(asset.uri).base64();
  const bytes = base64ToBytes(base64);
  if (bytes.length > MAX_IMPORT_BYTES) throw new ImportLimitError('tooLarge');
  return { name: asset.name, text: decodeBytes(bytes) };
}
