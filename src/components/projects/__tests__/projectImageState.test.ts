import { describe, expect, it } from 'vitest';
import { initialProjectImageState, transitionProjectImage } from '../projectImageState';

describe('project image transitions', () => {
  const file = new File(['photo'], 'photo.jpg');
  it('ignores a late selection after remove', () => {
    const selecting = transitionProjectImage(initialProjectImageState, { type: 'select' });
    const removed = transitionProjectImage(selecting, { type: 'remove' });
    expect(
      transitionProjectImage(removed, { type: 'selected', id: selecting.selection, file })
    ).toBe(removed);
    expect(removed.change).toEqual({ type: 'remove' });
    expect(removed.crop.phase).toBe('closed');
  });
  it('ignores remote crop results after replacement', () => {
    const loading = transitionProjectImage(initialProjectImageState, { type: 'load-crop' });
    const selecting = transitionProjectImage(loading, { type: 'select' });
    expect(
      transitionProjectImage(selecting, { type: 'loaded-crop', id: loading.revision, file })
    ).toBe(selecting);
  });
  it('ends a failed remote crop attempt without changing the image', () => {
    const loading = transitionProjectImage(initialProjectImageState, { type: 'load-crop' });
    const failed = transitionProjectImage(loading, { type: 'crop-failed', id: loading.revision });
    expect(failed.crop.phase).toBe('closed');
    expect(failed.change).toEqual({ type: 'keep' });
  });
  it('retains the selected image when the crop dialog closes', () => {
    const selecting = transitionProjectImage(initialProjectImageState, { type: 'select' });
    const selected = transitionProjectImage(selecting, {
      type: 'selected',
      id: selecting.selection,
      file,
    });
    const closed = transitionProjectImage(selected, { type: 'close-crop' });
    expect(closed.change).toEqual({ type: 'replace', file });
    expect(closed.crop.phase).toBe('closed');
  });
});
