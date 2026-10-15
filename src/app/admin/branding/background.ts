// Removing a flat background from a logo and cropping its empty margins. Pure: works on RGBA pixel arrays
// (ImageData.data), so the browser does the drawing and these can be tested on their own.

export type Pixels = { data: Uint8ClampedArray; width: number; height: number }

const distance = (data: Uint8ClampedArray, index: number, color: [number, number, number]) =>
  Math.sqrt((data[index] - color[0]) ** 2 + (data[index + 1] - color[1]) ** 2 + (data[index + 2] - color[2]) ** 2)

/** The background colour: the four corners, when they agree (and are opaque); null when the image has no flat background. */
export function cornerColor({ data, width, height }: Pixels, agree = 40): [number, number, number] | null {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1].map((pixel) => pixel * 4)
  if (corners.some((index) => data[index + 3] < 200)) return null
  const color: [number, number, number] = [0, 1, 2].map((channel) => Math.round(corners.reduce((sum, index) => sum + data[index + channel], 0) / 4)) as [number, number, number]
  return corners.every((index) => distance(data, index, color) <= agree) ? color : null
}

/**
 * Makes the background transparent: pixels within `tolerance` of `color` become clear, those a little further fade, so
 * edges stay soft. By default only background connected to the edges is removed (the logo's own dark parts stay);
 * `everywhere` also clears enclosed areas such as the inside of an "O".
 */
export function removeBackground(pixels: Pixels, color: [number, number, number], tolerance: number, everywhere = false): Pixels {
  const { width, height } = pixels
  const data = new Uint8ClampedArray(pixels.data)
  const soft = tolerance * 1.6
  const fade = (pixel: number) => {
    const index = pixel * 4, d = distance(data, index, color)
    if (d <= tolerance) { data[index + 3] = 0; return true }
    if (d <= soft) { data[index + 3] = Math.min(data[index + 3], Math.round(255 * (d - tolerance) / (soft - tolerance))); return false }
    return false
  }
  if (everywhere) {
    for (let pixel = 0; pixel < width * height; pixel++) fade(pixel)
    return { data, width, height }
  }
  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x)
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1)
  while (stack.length) {
    const pixel = stack.pop()!
    if (seen[pixel]) continue
    seen[pixel] = 1
    if (!fade(pixel)) continue
    const x = pixel % width, y = (pixel - x) / width
    if (x > 0) stack.push(pixel - 1)
    if (x < width - 1) stack.push(pixel + 1)
    if (y > 0) stack.push(pixel - width)
    if (y < height - 1) stack.push(pixel + width)
  }
  return { data, width, height }
}

/** The smallest box around the visible pixels, with a little room; the whole image when nothing is transparent. */
export function visibleBox({ data, width, height }: Pixels, padding = 4, threshold = 12) {
  let top = height, left = width, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > threshold) { if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y }
  }
  if (right < 0) return { x: 0, y: 0, width, height }
  const x = Math.max(0, left - padding), y = Math.max(0, top - padding)
  return { x, y, width: Math.min(width, right + padding + 1) - x, height: Math.min(height, bottom + padding + 1) - y }
}

/** Whether the image already has see-through parts (then no background needs removing). */
export const hasTransparency = ({ data }: Pixels) => { for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true; return false }
