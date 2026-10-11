import type { Page } from '@playwright/test';

type ScreenshotPaintMetrics = {
  firstLargestRowStep: number;
  secondLargestRowStep: number;
  largestDifference: number;
};

type ScreenshotRowStepOptions = {
  x: number;
  width: number;
  yEnd?: number;
  yStart?: number;
};

export const measureScreenshotLargestRowStep = async (
  page: Page,
  image: Buffer,
  { x, width, yEnd, yStart }: ScreenshotRowStepOptions
): Promise<number> =>
  page.evaluate(
    async ({ base64, x, width, yEnd, yStart }) => {
      const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Could not create a 2D canvas context to inspect screenshot paint');
        }
        context.drawImage(bitmap, x, 0, width, bitmap.height, 0, 0, width, bitmap.height);
        const screenshot = context.getImageData(0, 0, width, bitmap.height);
        const stride = screenshot.width * 4;
        const firstRow = Math.max(1, yStart ?? 1);
        const finalRow = Math.min(screenshot.height, yEnd ?? screenshot.height);
        let largestStep = 0;
        for (let offset = firstRow * stride; offset < finalRow * stride; offset += 4) {
          for (let channel = 0; channel < 3; channel++) {
            largestStep = Math.max(
              largestStep,
              Math.abs(
                screenshot.data[offset + channel] - screenshot.data[offset - stride + channel]
              )
            );
          }
        }
        return largestStep;
      } finally {
        bitmap.close();
      }
    },
    { base64: image.toString('base64'), x, width, yEnd, yStart }
  );

export const measureScreenshotPaint = async (
  page: Page,
  first: Buffer,
  second: Buffer
): Promise<ScreenshotPaintMetrics> =>
  page.evaluate(
    async images => {
      const decodeImageData = async (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        try {
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Could not create a 2D canvas context to inspect screenshot paint');
          }
          context.drawImage(bitmap, 0, 0);
          return context.getImageData(0, 0, bitmap.width, bitmap.height);
        } finally {
          bitmap.close();
        }
      };

      const largestRowStep = (image: ImageData) => {
        const stride = image.width * 4;
        let largestStep = 0;
        for (let offset = stride; offset < image.data.length; offset += 4) {
          for (let channel = 0; channel < 3; channel++) {
            largestStep = Math.max(
              largestStep,
              Math.abs(image.data[offset + channel] - image.data[offset - stride + channel])
            );
          }
        }
        return largestStep;
      };

      const [firstImage, secondImage] = await Promise.all(images.map(decodeImageData));
      if (firstImage.width !== secondImage.width || firstImage.height !== secondImage.height) {
        throw new Error('Cannot compare screenshot paint with different dimensions');
      }

      const largestDifference = firstImage.data.reduce(
        (largest, value, index) => Math.max(largest, Math.abs(value - secondImage.data[index])),
        0
      );

      return {
        firstLargestRowStep: largestRowStep(firstImage),
        secondLargestRowStep: largestRowStep(secondImage),
        largestDifference,
      };
    },
    [first.toString('base64'), second.toString('base64')]
  );
