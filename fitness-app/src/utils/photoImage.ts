/**
 * Progress photos are stored as raw base64 JPEG, but a cropped one may already carry a data:
 * prefix, so both shapes have to render.
 */
export function photoImageSrc(imageData: string): string {
  if (imageData.startsWith('data:')) return imageData;
  return `data:image/jpeg;base64,${imageData}`;
}
