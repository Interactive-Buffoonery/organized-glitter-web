interface DiamondPageResult {
  currentPage: number;
  totalPages: number;
  isSuccess: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
}

export function getDiamondPageCorrection(result: DiamondPageResult): number | null {
  if (!result.isSuccess || result.isFetching || result.isPlaceholderData) return null;
  const lastValidPage = Math.max(1, result.totalPages);
  return result.currentPage > lastValidPage ? lastValidPage : null;
}
