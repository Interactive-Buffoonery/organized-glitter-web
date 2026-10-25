import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { ColorKey } from '@/services/pocketbase/colorKeys.service';
import { ColorsSummary } from '../ColorsSummary';

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  keysError: false,
  referenceError: false,
  reference: null as null | { notes: string; photos: string[] },
  images: undefined as undefined | { filename: string; thumbnail: string; original: string }[],
  imagesError: false,
  refetch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/hooks/queries/coloring/useColorKeys', () => ({
  useColorKeys: () => ({
    data: state.keysError ? undefined : state.rows,
    isPending: false,
    isError: state.keysError,
    refetch: state.refetch,
  }),
  useSymbolRequests: () => ({ data: {} }),
}));
vi.mock('@/hooks/queries/coloring/useColorReference', () => ({
  useColorReference: () => ({
    data: state.referenceError ? undefined : state.reference,
    isPending: false,
    isError: state.referenceError,
    refetch: state.refetch,
  }),
  useColorReferenceImages: () => ({
    data: state.images,
    isError: state.imagesError,
    refetch: state.refetch,
  }),
}));
vi.mock('@/lib/notifications', () => ({ notifyError: state.error, notifySuccess: state.success }));
vi.mock('@/components/image/PrivateFileImage', () => ({
  PrivateFileImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const key = (position: number, symbol: string, code = '', color_name = '') =>
  ({ id: `k${position}`, position, symbol, code, color_name, swatch: '' }) as ColorKey;
const photos = (count: number) => Array.from({ length: count }, (_, index) => `p${index}.jpg`);

const renderSummary = () =>
  render(
    <MemoryRouter>
      <ColorsSummary bookId="book-1" pageId="page-1" returnTo="/dashboard?craft=coloring" />
    </MemoryRouter>
  );

beforeEach(() => {
  state.rows = [];
  state.keysError = false;
  state.referenceError = false;
  state.reference = null;
  state.images = undefined;
  state.imagesError = false;
  state.refetch.mockReset();
  state.success.mockReset();
  state.error.mockReset();
});

describe('Colors summary', () => {
  it('offers one way in when nothing is tracked yet', () => {
    renderSummary();
    const track = screen.getByRole('link', { name: "Track this page's colors" });
    expect(track).toHaveAttribute(
      'href',
      '/coloring/book-1/pages/page-1/colors?returnTo=%2Fdashboard%3Fcraft%3Dcoloring'
    );
    expect(screen.queryByRole('group', { name: 'Symbols on this page' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit colors' })).toBeNull();
  });

  it('lists the recorded colors with progress and a link to edit them', () => {
    state.rows = [key(0, 'u:0031', '654'), key(1, 'u:0032')];
    renderSummary();
    expect(screen.getByText('654')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 filled in')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit colors' })).toHaveAttribute(
      'href',
      expect.stringContaining('/coloring/book-1/pages/page-1/colors')
    );
    expect(screen.queryByRole('link', { name: "Track this page's colors" })).toBeNull();
  });

  it('shows photos even before any symbols are set up', () => {
    state.reference = { notes: '', photos: ['strip.jpg'] };
    state.images = [{ filename: 'strip.jpg', thumbnail: 'thumb.jpg', original: 'full.jpg' }];
    renderSummary();
    expect(screen.getByRole('img', { name: 'Color photo 1' })).toHaveAttribute('src', 'thumb.jpg');
    expect(screen.getByRole('link', { name: 'Edit colors' })).toBeInTheDocument();
    expect(screen.queryByText(/filled in/)).toBeNull();
  });

  it('caps thumbnails at four and counts the rest', () => {
    state.reference = { notes: '', photos: photos(6) };
    state.images = photos(6).map(filename => ({ filename, thumbnail: filename, original: '' }));
    renderSummary();
    const list = screen.getByRole('list', { name: 'Color photos' });
    expect(list.querySelectorAll('li')).toHaveLength(4);
    expect(screen.getByText('2 more photos')).toBeInTheDocument();
  });

  it('holds a place for photos that are still loading', () => {
    state.reference = { notes: '', photos: photos(2) };
    renderSummary();
    const list = screen.getByRole('list', { name: 'Color photos' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('offers a retry when the photos cannot load', async () => {
    const user = userEvent.setup();
    state.reference = { notes: '', photos: photos(1) };
    state.imagesError = true;
    renderSummary();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.refetch).toHaveBeenCalled();
  });

  it('shows the color name when a row has no code', () => {
    state.rows = [key(0, 'u:0031', '', 'Lilac'), key(1, 'u:0032')];
    renderSummary();
    expect(screen.getByText('One, no code yet, Lilac')).toBeInTheDocument();
    expect(screen.getByText('No code')).toBeInTheDocument();
  });

  it('copies the recorded colors', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    onTestFinished(() => {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else Reflect.deleteProperty(navigator, 'clipboard');
    });
    state.rows = [key(0, 'u:0031', '654')];
    renderSummary();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('654'));
    expect(state.success).toHaveBeenCalledWith('Copied the colors for this page.');
  });

  it('offers a retry when the photo record cannot load', async () => {
    const user = userEvent.setup();
    state.referenceError = true;
    renderSummary();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.refetch).toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: "Track this page's colors" })).toBeNull();
  });

  it('keeps the loaded colors and the edit link when photos fail', () => {
    state.rows = [key(0, 'u:0031', '654')];
    state.referenceError = true;
    renderSummary();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the colors for this page.');
    expect(screen.getByText('654')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit colors' })).toBeInTheDocument();
  });

  it('offers a retry when the colors cannot load', async () => {
    const user = userEvent.setup();
    state.keysError = true;
    renderSummary();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.refetch).toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: "Track this page's colors" })).toBeNull();
  });
});
