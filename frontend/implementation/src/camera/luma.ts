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
