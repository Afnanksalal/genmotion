import { createCanvas, type Canvas } from '@napi-rs/canvas';
export type Quad = [[number, number], [number, number], [number, number], [number, number]];
type Matrix3 = [number, number, number, number, number, number, number, number, number];

export function quadHomography(quad: Quad): Matrix3 | null {
  if (!quad.flat().every(Number.isFinite)) throw new Error('Projective corners must be finite');
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx3) + Math.abs(dy3) > 1e-12) {
    const denominator = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(denominator) < 1e-12) return null;
    g = (dx3 * dy2 - dx2 * dy3) / denominator; h = (dx1 * dy3 - dx3 * dy1) / denominator;
  }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
function inverse(matrix: Matrix3): Matrix3 | null {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) return null;
  return [(e * i - f * h) / determinant, (c * h - b * i) / determinant, (b * f - c * e) / determinant, (f * g - d * i) / determinant, (a * i - c * g) / determinant, (c * d - a * f) / determinant, (d * h - e * g) / determinant, (b * g - a * h) / determinant, (a * e - b * d) / determinant];
}
export function projectPoint(matrix: Matrix3, x: number, y: number): [number, number] | null {
  const denominator = matrix[6] * x + matrix[7] * y + matrix[8];
  if (Math.abs(denominator) < 1e-12) return null;
  return [(matrix[0] * x + matrix[1] * y + matrix[2]) / denominator, (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator];
}
/** Full-canvas normalized corners, clockwise from the source's top-left. */
export function warpCanvasQuad(input: Canvas, quad: Quad): Canvas {
  const width = input.width, height = input.height, output = createCanvas(width, height), context = output.getContext('2d');
  const matrix = quadHomography(quad), map = matrix ? inverse(matrix) : null;
  if (!map) return output;
  const source = input.getContext('2d').getImageData(0, 0, width, height).data, image = context.createImageData(width, height), target = image.data;
  const xs = quad.map((point) => point[0] * width), ys = quad.map((point) => point[1] * height);
  const left = Math.max(0, Math.floor(Math.min(...xs))), right = Math.min(width, Math.ceil(Math.max(...xs))), top = Math.max(0, Math.floor(Math.min(...ys))), bottom = Math.min(height, Math.ceil(Math.max(...ys)));
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const point = projectPoint(map, (x + .5) / width, (y + .5) / height);
    if (!point || point[0] < 0 || point[0] > 1 || point[1] < 0 || point[1] > 1) continue;
    const sx = point[0] * width - .5, sy = point[1] * height - .5, ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    let alpha = 0, r = 0, g = 0, b = 0;
    for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
      const px = ix + dx, py = iy + dy; if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const index = (py * width + px) * 4, weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * source[index + 3]! / 255;
      alpha += weight; r += source[index]! * weight; g += source[index + 1]! * weight; b += source[index + 2]! * weight;
    }
    const index = (y * width + x) * 4;
    target[index] = alpha ? r / alpha : 0; target[index + 1] = alpha ? g / alpha : 0; target[index + 2] = alpha ? b / alpha : 0; target[index + 3] = alpha * 255;
  }
  context.putImageData(image, 0, 0); return output;
}

export function perspectiveQuad(width: number, height: number, yaw: number, pitch = 0, center: [number, number] = [.5, .5], hinge = false): Quad {
  const yAngle = yaw * Math.PI / 180, xAngle = pitch * Math.PI / 180, focal = Math.max(width, height) * 2;
  const pivot = hinge ? -width / 2 : 0;
  return [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]].map(([x, y]) => {
    const rx = (x! - pivot) * Math.cos(yAngle), rz = -(x! - pivot) * Math.sin(yAngle), ry = y! * Math.cos(xAngle) - rz * Math.sin(xAngle), z = y! * Math.sin(xAngle) + rz * Math.cos(xAngle), scale = focal / (focal - z);
    return [center[0] + (rx * scale + pivot) / width, center[1] + ry * scale / height];
  }) as Quad;
}
export function cubeTransitionQuads(width: number, height: number, progress: number): [Quad, Quad] {
  const angle = -Math.max(0, Math.min(1, progress)) * Math.PI / 2, w = width / 2, h = height / 2, distance = Math.max(width, height) * 2 + w;
  const project = (points: number[][]): Quad => points.map(([x, y, z]) => { const rx = x! * Math.cos(angle) + z! * Math.sin(angle), rz = -x! * Math.sin(angle) + z! * Math.cos(angle), scale = (distance - w) / (distance - rz); return [.5 + rx * scale / width, .5 + y! * scale / height]; }) as Quad;
  return [project([[-w, -h, w], [w, -h, w], [w, h, w], [-w, h, w]]), project([[w, -h, w], [w, -h, -w], [w, h, -w], [w, h, w]])];
}
