import { describe, expect, it } from 'vitest';
import { withoutFileToken } from '@/utils/error/resourceErrorTracking';

describe('resource error URLs', () => {
  it('removes file tokens before an image failure can be retained or logged', () => {
    expect(
      withoutFileToken(
        'https://pb.example/api/files/projects/one/image.jpg?token=header.payload.signature&thumb=80x80'
      )
    ).toBe('https://pb.example/api/files/projects/one/image.jpg?thumb=80x80');
  });
});
