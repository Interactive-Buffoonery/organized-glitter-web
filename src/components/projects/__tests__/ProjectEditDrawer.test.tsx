import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';

import {
  describe,
  expect,
  it,
  renderWithProviders,
  screen,
  userEvent,
  beforeEach,
} from '@/test-utils';
import type { ProjectFormValues, ProjectType } from '@/types/project';

const {
  drawerPropsMock,
  editProjectState,
  handleArchiveMock,
  handleDeleteMock,
  handleFormDataChangeMock,
  handleSubmitMock,
  keyboardSafeViewportStyleMock,
} = vi.hoisted(() => {
  const drawerPropsMock = vi.fn();
  const handleArchiveMock = vi.fn();
  const handleDeleteMock = vi.fn();
  const handleFormDataChangeMock = vi.fn();
  const handleSubmitMock = vi.fn();
  const keyboardSafeViewportStyleMock = vi.fn(() => ({
    bottom: '300px',
    height: '500px',
    maxHeight: '500px',
  }));

  const project: ProjectType = {
    id: 'project-123',
    userId: 'user-123',
    title: 'Aurora Wolves',
    company: 'Diamond Dotz',
    status: 'progress',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const formData: ProjectFormValues = {
    id: 'project-123',
    userId: 'user-123',
    title: 'Aurora Wolves',
    sourceUrl: 'https://example.com/kit',
    status: 'progress',
  };

  return {
    drawerPropsMock,
    handleArchiveMock,
    handleDeleteMock,
    handleFormDataChangeMock,
    handleSubmitMock,
    keyboardSafeViewportStyleMock,
    editProjectState: {
      project,
      loading: false,
      submitting: false,
      companies: [],
      artists: [],
      formData,
      fieldErrors: {},
      draft: {
        recoverable: null,
        pending: false,
        storageFailed: false,
        discardOnCancel: () => true,
      },
      photoChoicePending: false,
      continueWithoutPhoto: vi.fn(),
      imageCompatError: null,
      clearImageCompatError: vi.fn(),
      handleFormDataChange: handleFormDataChangeMock,
      handleSubmit: handleSubmitMock,
      handleArchive: handleArchiveMock,
      handleDelete: handleDeleteMock,
      ConfirmationDialog: () => null,
    },
  };
});

vi.mock('@/hooks/use-mobile', () => ({
  useMobileDevice: () => ({
    isMobile: true,
    isPhone: true,
    isTouchDevice: true,
    isMobileAndTouch: true,
    isTablet: false,
    isLandscape: false,
    screenSize: 'xs-',
    width: 390,
    height: 844,
  }),
}));

vi.mock('@/hooks/useKeyboardSafeViewportStyle', () => ({
  useKeyboardSafeViewportStyle: keyboardSafeViewportStyleMock,
}));

vi.mock('@/hooks/useEditProject', () => ({
  useEditProject: () => ({
    ...editProjectState,
    confirmDiscard: (leave: () => void) => {
      leave();
      return true;
    },
  }),
}));

vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children, ...props }: { children: React.ReactNode }) => {
    drawerPropsMock(props);
    return <div data-testid="phone-edit-drawer">{children}</div>;
  },
  DrawerContent: ({
    children,
    className,
    style,
  }: {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }) => (
    <div
      role="dialog"
      aria-label="Edit project"
      data-testid="phone-edit-drawer-content"
      className={className}
      style={style}
    >
      {children}
    </div>
  ),
  DrawerTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
  DrawerDescription: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <p className={className}>{children}</p>,
}));

vi.mock('@/components/projects/ProjectFormSections', () => ({
  default: ({
    formData,
  }: {
    formData: ProjectFormValues;
    onChange: (data: ProjectFormValues) => void;
  }) => (
    <label>
      Source URL
      <input defaultValue={formData.sourceUrl} />
    </label>
  ),
}));

vi.mock('@/components/projects/IncompatibleImageDialog', () => ({
  IncompatibleImageDialog: () => null,
}));

import ProjectEditDrawer from '../ProjectEditDrawer';

describe('ProjectEditDrawer', () => {
  beforeEach(() => {
    drawerPropsMock.mockClear();
    handleArchiveMock.mockReset();
    handleDeleteMock.mockReset();
    handleFormDataChangeMock.mockReset();
    handleSubmitMock.mockReset().mockResolvedValue(true);
    keyboardSafeViewportStyleMock.mockClear();
  });

  it('keeps the phone drawer footer anchored to the keyboard-safe viewport', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ProjectEditDrawer projectId="project-123" isOpen onOpenChange={vi.fn()} />
    );

    expect(keyboardSafeViewportStyleMock).toHaveBeenCalledWith(true);
    expect(drawerPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        open: true,
        shouldScaleBackground: false,
        repositionInputs: false,
      })
    );

    const drawerContent = screen.getByTestId('phone-edit-drawer-content');
    expect(drawerContent).toHaveClass('flex', 'flex-col');
    expect(drawerContent).toHaveStyle({
      bottom: '300px',
      height: '500px',
      maxHeight: '500px',
    });

    await user.click(screen.getByLabelText('Source URL'));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeVisible();
  });
});
