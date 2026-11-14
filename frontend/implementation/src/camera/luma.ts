/**
 * Cheap brightness estimate for the low-light switch.
 *
 * This is image luma (0..1 of 8-bit brightness), NOT physical lux. A camera's
 * auto-exposure can hide a dark room, so treat the number as a relative hint only.
 */

/** BT.601 luma in 0..255 with integer weights (77, 150, 29 sum to 256, so no float math per pixel). */
export function pixelLuma(r: number, g: number, b: number): number {
  return (77 * r + 150 * g + 29 * b + 128) >> 8;
}

/**
 * Mean luma of an RGBA buffer, normalised to 0..1.
 * `sampleStep` reads every Nth pixel in both axes; 2 or 4 is enough for a 320 px frame.
 */
/** Mean luma in the central hand/face zone, for backlit-subject detection. */
export function centerLuma(rgba: ArrayLike<number>, width: number, height: number, sampleStep = 2): number {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return 0;
  const x0 = Math.floor(width * 0.25);
  const x1 = Math.min(width, Math.max(x0 + 1, Math.ceil(width * 0.75)));
  const y0 = Math.floor(height * 0.2);
  const y1 = Math.min(height, Math.max(y0 + 1, Math.ceil(height * 0.85)));
  const stride = Math.max(1, Math.floor(sampleStep));
  let sum = 0, count = 0;
  for (let y = y0; y < y1; y += stride) {
    for (let x = x0; x < x1; x += stride) {
      const i = (y * width + x) * 4;
      sum += pixelLuma(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0);
      count++;
    }
  }
  return count ? sum / count / 255 : 0;
}

export function meanLuma(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  sampleStep = 2,
): number {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return 0;
  const step = Math.max(1, Math.floor(sampleStep));
  let sum = 0;
  let count = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      sum += pixelLuma(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0);
      count++;
    }
  }
  return count === 0 ? 0 : sum / count / 255;
}
