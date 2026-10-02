import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ImageGallery from '../ImageGallery';
import { PrivateFileTokenContext } from '@/contexts/privateFileTokenState';

const imageUrl = 'https://cdn.organizedglitter.test/project-cover.jpg';

describe('ImageGallery', () => {
  it('crops preview images by default', () => {
    render(<ImageGallery imageUrl={imageUrl} alt="Portrait kit" />);

    const image = screen.getByRole('img', { name: 'Portrait kit' });
    expect(image).toHaveClass('object-cover');
    expect(image).not.toHaveClass('object-contain');
  });

  it('fits preview images without hover scaling when contain mode is requested', () => {
    render(<ImageGallery imageUrl={imageUrl} alt="Portrait kit" previewFit="contain" />);

    const image = screen.getByRole('img', { name: 'Portrait kit' });
    expect(image).toHaveClass('object-contain');
    expect(image).not.toHaveClass('object-cover');
    expect(image).not.toHaveClass('group-hover:scale-105');
    expect(image.closest('.bg-muted')).not.toBeInTheDocument();
  });

  it('keeps modal image loading independent when the preview image fails', async () => {
    const { container } = render(<ImageGallery imageUrl={imageUrl} alt="Portrait kit" />);

    fireEvent.error(screen.getByRole('img', { name: 'Portrait kit' }));
    expect(screen.getByRole('status')).toBeInTheDocument();

    const trigger = container.querySelector('.group.relative.cursor-pointer');
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger as Element);

    const modalImages = await screen.findAllByRole('img', { name: 'Portrait kit' });
    expect(modalImages).toHaveLength(1);
    expect(modalImages[0]).toHaveClass('object-contain');
  });

  it('keeps a failed preview mounted so a renewed file token can load it', () => {
    const { rerender } = render(<ImageGallery imageUrl={imageUrl} alt="Portrait kit" />);
    const image = screen.getByRole('img', { name: 'Portrait kit' });
    fireEvent.error(image);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Portrait kit' })).toBe(image);
    rerender(<ImageGallery imageUrl={imageUrl} alt="Portrait kit" />);
    fireEvent.load(image);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('announces a failed preview and lets retry without opening the gallery', () => {
    render(<ImageGallery imageUrl={imageUrl} alt="Portrait kit" />);
    fireEvent.error(screen.getByRole('img', { name: 'Portrait kit' }));

    const opener = screen.getByRole('button', { name: 'View larger image: Portrait kit' });
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(opener).not.toContainElement(retry);
    expect(screen.getByRole('status')).toHaveTextContent('Image failed to load');
    fireEvent.click(retry);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the injected dialog close off and exposes a coarse-friendly toolbar Close', async () => {
    render(<ImageGallery imageUrl={imageUrl} alt="Portrait kit" />);

    fireEvent.click(screen.getByRole('button', { name: 'View larger image: Portrait kit' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    const closeButton = screen.getByRole('button', { name: 'Close' });
    expect(closeButton).toBeInTheDocument();
    expect(closeButton).toHaveClass('pointer-coarse:size-11');
    // Injected DialogContent close uses absolute top-4 right-4; toolbar close does not.
    expect(closeButton).not.toHaveClass('absolute');
    expect(closeButton).not.toHaveClass('top-4');
    expect(closeButton).not.toHaveClass('right-4');

    fireEvent.click(closeButton);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names icon toolbar actions with aria-labels instead of title alone', async () => {
    render(<ImageGallery imageUrl={imageUrl} alt="Portrait kit" />);

    fireEvent.click(screen.getByRole('button', { name: 'View larger image: Portrait kit' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    const openInNewTab = screen.getByRole('link', { name: 'Open image in new tab' });
    expect(openInNewTab).toBeInTheDocument();
    expect(openInNewTab).not.toHaveAttribute('title');
    expect(openInNewTab).toHaveClass('pointer-coarse:size-11');
    expect(openInNewTab.querySelector('svg.lucide-external-link')).toBeInTheDocument();
    expect(openInNewTab.querySelector('svg.lucide-maximize')).not.toBeInTheDocument();

    const modalImage = screen.getByRole('img', { name: 'Portrait kit' });
    fireEvent.error(modalImage);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('status')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: 'Retry loading image' });
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).not.toHaveAttribute('title');
    expect(retryButton).toHaveClass('pointer-coarse:size-11');
    expect(screen.queryByRole('link', { name: 'Open image in new tab' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    fireEvent.click(retryButton);
    expect(within(screen.getByRole('dialog')).queryByRole('status')).not.toBeInTheDocument();
    fireEvent.load(within(screen.getByRole('dialog')).getByRole('img', { name: 'Portrait kit' }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('keeps the open dialog and focused control mounted when a file token rotates', async () => {
    const privateUrl = 'https://data.organizedglitter.app/api/files/projects/one/cover.jpg';
    const view = render(
      <PrivateFileTokenContext.Provider value={{ userId: 'owner', value: 'first', issuedAt: 1 }}>
        <ImageGallery imageUrl={privateUrl} alt="Private cover" />
      </PrivateFileTokenContext.Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'View larger image: Private cover' }));
    const closeButton = await screen.findByRole('button', { name: 'Close' });
    closeButton.focus();

    view.rerender(
      <PrivateFileTokenContext.Provider value={{ userId: 'owner', value: 'second', issuedAt: 2 }}>
        <ImageGallery imageUrl={privateUrl} alt="Private cover" />
      </PrivateFileTokenContext.Provider>
    );

    expect(screen.getByRole('button', { name: 'Close' })).toBe(closeButton);
    expect(closeButton).toHaveFocus();
    expect(screen.queryByRole('link', { name: 'Open image in new tab' })).not.toBeInTheDocument();
  });
});
