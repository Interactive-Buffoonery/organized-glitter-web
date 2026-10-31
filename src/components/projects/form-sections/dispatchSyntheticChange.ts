import type React from 'react';

export const dispatchSyntheticChange = (
  file: File,
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void
) => {
  const dt = new DataTransfer();
  dt.items.add(file);
  const fakeInput = document.createElement('input');
  fakeInput.type = 'file';
  fakeInput.files = dt.files;
  onImageChange({
    target: fakeInput,
    currentTarget: fakeInput,
  } as unknown as React.ChangeEvent<HTMLInputElement>);
};
