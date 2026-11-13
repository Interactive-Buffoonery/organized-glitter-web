import { useCallback, useState, type SetStateAction } from 'react';
import type { ProjectFormValues } from '@/types/project';
import type { ProjectFormFieldErrors } from '@/schemas/project.schema';

export type ProjectFormUpdate = SetStateAction<ProjectFormValues>;

const clearChangedFieldErrors = (
  errors: ProjectFormFieldErrors,
  previous: ProjectFormValues,
  next: ProjectFormValues
): ProjectFormFieldErrors => {
  const nextErrors = { ...errors };

  for (const field of Object.keys(nextErrors) as Array<keyof ProjectFormValues>) {
    const previousValue = previous[field];
    const nextValue = next[field];
    const changed =
      Array.isArray(previousValue) || Array.isArray(nextValue)
        ? JSON.stringify(previousValue) !== JSON.stringify(nextValue)
        : previousValue !== nextValue;

    if (changed) {
      delete nextErrors[field];
    }
  }

  return nextErrors;
};

export function useProjectFormState<T extends ProjectFormValues | null>(
  initial: () => T,
  initialMissingPhoto: boolean
) {
  const [state, setState] = useState(() => ({
    formData: initial(),
    fieldErrors: {} as ProjectFormFieldErrors,
    missingPhoto: initialMissingPhoto,
  }));
  const setFormData = useCallback(
    (update: SetStateAction<T>) =>
      setState(previous => ({
        ...previous,
        formData: typeof update === 'function' ? update(previous.formData) : update,
      })),
    []
  );
  const setFieldErrors = useCallback(
    (update: SetStateAction<ProjectFormFieldErrors>) =>
      setState(previous => ({
        ...previous,
        fieldErrors: typeof update === 'function' ? update(previous.fieldErrors) : update,
      })),
    []
  );
  const setMissingPhoto = useCallback(
    (update: SetStateAction<boolean>) =>
      setState(previous => ({
        ...previous,
        missingPhoto: typeof update === 'function' ? update(previous.missingPhoto) : update,
      })),
    []
  );
  const changeFormData = useCallback(
    (update: ProjectFormUpdate) =>
      setState(previous => {
        if (!previous.formData) return previous;
        const formData = typeof update === 'function' ? update(previous.formData) : update;
        return {
          formData: formData as T,
          fieldErrors: clearChangedFieldErrors(previous.fieldErrors, previous.formData, formData),
          missingPhoto: formData.imageFile || formData.imageRemoved ? false : previous.missingPhoto,
        };
      }),
    []
  );
  return { ...state, setFormData, setFieldErrors, setMissingPhoto, changeFormData };
}
