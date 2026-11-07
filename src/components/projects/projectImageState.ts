export type ImageChange = { type: 'keep' } | { type: 'replace'; file: File } | { type: 'remove' };

export type CropDialogState =
  { phase: 'closed' } | { phase: 'loading'; id: number } | { phase: 'open'; file: File };

export type ProjectImageState = {
  change: ImageChange;
  crop: CropDialogState;
  selection: number;
  revision: number;
};

export const initialProjectImageState: ProjectImageState = {
  change: { type: 'keep' },
  crop: { phase: 'closed' },
  selection: 0,
  revision: 0,
};

type ImageEvent =
  | { type: 'select' }
  | { type: 'selected'; id: number; file: File }
  | { type: 'remove' }
  | { type: 'load-crop' }
  | { type: 'loaded-crop'; id: number; file: File }
  | { type: 'crop-failed'; id: number }
  | { type: 'open-crop'; file: File }
  | { type: 'close-crop' }
  | { type: 'apply'; file: File }
  | { type: 'source-changed'; change: ImageChange };

export function transitionProjectImage(
  state: ProjectImageState,
  event: ImageEvent
): ProjectImageState {
  switch (event.type) {
    case 'select':
      return { ...state, selection: state.selection + 1, revision: state.revision + 1 };
    case 'selected':
      return event.id === state.selection
        ? {
            ...state,
            change: { type: 'replace', file: event.file },
            crop: { phase: 'open', file: event.file },
          }
        : state;
    case 'remove':
      return {
        change: { type: 'remove' },
        crop: { phase: 'closed' },
        selection: state.selection + 1,
        revision: state.revision + 1,
      };
    case 'load-crop':
      return {
        ...state,
        revision: state.revision + 1,
        crop: { phase: 'loading', id: state.revision + 1 },
      };
    case 'loaded-crop':
      return state.crop.phase === 'loading' && event.id === state.revision
        ? { ...state, crop: { phase: 'open', file: event.file } }
        : state;
    case 'crop-failed':
      return state.crop.phase === 'loading' && event.id === state.revision
        ? { ...state, crop: { phase: 'closed' } }
        : state;
    case 'open-crop':
      return { ...state, crop: { phase: 'open', file: event.file } };
    case 'close-crop':
      return { ...state, crop: { phase: 'closed' } };
    case 'apply':
      return {
        ...state,
        change: { type: 'replace', file: event.file },
        crop: { phase: 'open', file: event.file },
      };
    case 'source-changed':
      return {
        ...state,
        change: event.change,
        revision: state.revision + 1,
        crop: state.crop.phase === 'loading' ? { phase: 'closed' } : state.crop,
      };
  }
}

export function imageChangeFromFields(fields: {
  imageRemoved?: boolean;
  imageFile?: File | null;
}): ImageChange {
  return fields.imageRemoved
    ? { type: 'remove' }
    : fields.imageFile
      ? { type: 'replace', file: fields.imageFile }
      : { type: 'keep' };
}

export function imageChangeFields(change: ImageChange) {
  switch (change.type) {
    case 'keep':
      return { imageFile: null, imageRemoved: false };
    case 'replace':
      return { imageFile: change.file, imageRemoved: false };
    case 'remove':
      return { imageFile: null, imageUrl: '', imageRemoved: true };
  }
}
