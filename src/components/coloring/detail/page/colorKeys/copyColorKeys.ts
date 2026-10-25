import { notifyError, notifySuccess } from '@/lib/notifications';
import type { ColorKey, SymbolRequestPreview } from '@/services/pocketbase/colorKeys.service';
import { createLogger } from '@/utils/logger';
import { colorKeyCopyText } from './symbolName';

const logger = createLogger('copyColorKeys');

export async function copyColorKeys(
  rows: ColorKey[],
  requests?: Record<string, SymbolRequestPreview>
) {
  try {
    await navigator.clipboard.writeText(colorKeyCopyText(rows, requests));
    notifySuccess('Copied the colors for this page.');
  } catch (error) {
    logger.warn('Could not copy color keys', error);
    notifyError('Could not copy. Try again.');
  }
}
