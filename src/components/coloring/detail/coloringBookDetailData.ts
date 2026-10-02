export type ColoringBookMetadataItem = {
  label: string;
  value?: string | number | false | null;
  href?: string;
};

export function visibleItems(items: ColoringBookMetadataItem[]) {
  return items.filter(item => item.value !== undefined && item.value !== null && item.value !== '');
}
