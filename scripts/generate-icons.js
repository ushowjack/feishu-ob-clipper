import { mkdir, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";

const ICON_SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 4;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

await mkdir(new URL("../assets/", import.meta.url), { recursive: true });

for (const size of ICON_SIZES) {
  await writeFile(new URL(`../assets/icon${size}.png`, import.meta.url), renderIcon(size));
}

function renderIcon(size) {
  const width = size * SUPERSAMPLE;
  const height = size * SUPERSAMPLE;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const scale = width / 128;
  const toPx = (value) => value * scale;

  fillRoundedRect(pixels, width, height, toPx(8), toPx(8), toPx(112), toPx(112), toPx(28), (x, y) => {
    const nx = x / width;
    const ny = y / height;
    return mixColor([25, 36, 30], [30, 27, 47], Math.min(1, nx * 0.35 + ny * 0.7));
  });
  fillCircle(pixels, width, height, toPx(30), toPx(24), toPx(58), [126, 240, 170, 38]);
  fillCircle(pixels, width, height, toPx(93), toPx(92), toPx(54), [141, 108, 255, 48]);

  drawPolyline(pixels, width, height, [
    [toPx(38), toPx(38)],
    [toPx(87), toPx(38)],
    [toPx(41), toPx(90)],
    [toPx(91), toPx(90)],
  ], toPx(21), [5, 8, 7, 108]);

  drawGradientPolyline(pixels, width, height, [
    [toPx(38), toPx(38)],
    [toPx(87), toPx(38)],
    [toPx(41), toPx(90)],
    [toPx(91), toPx(90)],
  ], toPx(15.5), [
    [126, 240, 170, 255],
    [102, 215, 194, 255],
    [141, 108, 255, 255],
  ]);

  drawLine(pixels, width, height, toPx(39), toPx(38), toPx(63), toPx(38), toPx(5), [244, 255, 247, 86]);
  drawLine(pixels, width, height, toPx(66), toPx(62), toPx(84), toPx(42), toPx(4), [244, 255, 247, 46]);

  return encodePng(downsample(pixels, width, height, SUPERSAMPLE), size, size);
}

function fillRoundedRect(pixels, width, height, x, y, rectWidth, rectHeight, radius, color) {
  const minX = Math.max(0, Math.floor(x));
  const minY = Math.max(0, Math.floor(y));
  const maxX = Math.min(width, Math.ceil(x + rectWidth));
  const maxY = Math.min(height, Math.ceil(y + rectHeight));

  for (let py = minY; py < maxY; py += 1) {
    for (let px = minX; px < maxX; px += 1) {
      if (!insideRoundedRect(px + 0.5, py + 0.5, x, y, rectWidth, rectHeight, radius)) continue;
      const rgba = typeof color === "function" ? [...color(px + 0.5, py + 0.5), 255] : color;
      blendPixel(pixels, width, px, py, rgba);
    }
  }
}

function insideRoundedRect(px, py, x, y, width, height, radius) {
  const cx = Math.max(x + radius, Math.min(px, x + width - radius));
  const cy = Math.max(y + radius, Math.min(py, y + height - radius));
  return (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2;
}

function fillCircle(pixels, width, height, cx, cy, radius, color) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxX = Math.min(width, Math.ceil(cx + radius));
  const maxY = Math.min(height, Math.ceil(cy + radius));

  for (let py = minY; py < maxY; py += 1) {
    for (let px = minX; px < maxX; px += 1) {
      if ((px + 0.5 - cx) ** 2 + (py + 0.5 - cy) ** 2 <= radius ** 2) {
        blendPixel(pixels, width, px, py, color);
      }
    }
  }
}

function fillPolygon(pixels, width, height, points, color) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxX = Math.min(width, Math.ceil(Math.max(...xs)));
  const maxY = Math.min(height, Math.ceil(Math.max(...ys)));

  for (let py = minY; py < maxY; py += 1) {
    for (let px = minX; px < maxX; px += 1) {
      if (pointInPolygon(px + 0.5, py + 0.5, points)) blendPixel(pixels, width, px, py, color);
    }
  }
}

function drawLine(pixels, width, height, x1, y1, x2, y2, thickness, color) {
  const radius = thickness / 2;
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - radius));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - radius));
  const maxX = Math.min(width, Math.ceil(Math.max(x1, x2) + radius));
  const maxY = Math.min(height, Math.ceil(Math.max(y1, y2) + radius));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  for (let py = minY; py < maxY; py += 1) {
    for (let px = minX; px < maxX; px += 1) {
      const t = Math.max(0, Math.min(1, ((px + 0.5 - x1) * dx + (py + 0.5 - y1) * dy) / lengthSquared));
      const cx = x1 + t * dx;
      const cy = y1 + t * dy;
      if ((px + 0.5 - cx) ** 2 + (py + 0.5 - cy) ** 2 <= radius ** 2) {
        blendPixel(pixels, width, px, py, color);
      }
    }
  }
}

function drawPolyline(pixels, width, height, points, thickness, color) {
  for (let index = 0; index < points.length - 1; index += 1) {
    drawLine(pixels, width, height, points[index][0], points[index][1], points[index + 1][0], points[index + 1][1], thickness, color);
  }
}

function drawGradientPolyline(pixels, width, height, points, thickness, stops) {
  const lengths = [];
  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentLength = Math.hypot(points[index + 1][0] - points[index][0], points[index + 1][1] - points[index][1]);
    lengths.push(segmentLength);
    totalLength += segmentLength;
  }

  let traveled = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[index + 1];
    const steps = Math.max(1, Math.ceil(lengths[index] / 1.75));
    for (let step = 0; step < steps; step += 1) {
      const start = step / steps;
      const end = (step + 1) / steps;
      const global = (traveled + lengths[index] * (start + end) / 2) / totalLength;
      drawLine(
        pixels,
        width,
        height,
        x1 + (x2 - x1) * start,
        y1 + (y2 - y1) * start,
        x1 + (x2 - x1) * end,
        y1 + (y2 - y1) * end,
        thickness,
        gradientStop(stops, global),
      );
    }
    traveled += lengths[index];
  }
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function blendPixel(pixels, width, x, y, [r, g, b, a = 255]) {
  const index = (y * width + x) * 4;
  const sourceAlpha = a / 255;
  const targetAlpha = pixels[index + 3] / 255;
  const outAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);

  if (outAlpha === 0) return;

  pixels[index] = Math.round((r * sourceAlpha + pixels[index] * targetAlpha * (1 - sourceAlpha)) / outAlpha);
  pixels[index + 1] = Math.round((g * sourceAlpha + pixels[index + 1] * targetAlpha * (1 - sourceAlpha)) / outAlpha);
  pixels[index + 2] = Math.round((b * sourceAlpha + pixels[index + 2] * targetAlpha * (1 - sourceAlpha)) / outAlpha);
  pixels[index + 3] = Math.round(outAlpha * 255);
}

function downsample(source, width, height, factor) {
  const targetWidth = width / factor;
  const targetHeight = height / factor;
  const target = new Uint8ClampedArray(targetWidth * targetHeight * 4);

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let oy = 0; oy < factor; oy += 1) {
        for (let ox = 0; ox < factor; ox += 1) {
          const sourceIndex = ((y * factor + oy) * width + x * factor + ox) * 4;
          totals[0] += source[sourceIndex];
          totals[1] += source[sourceIndex + 1];
          totals[2] += source[sourceIndex + 2];
          totals[3] += source[sourceIndex + 3];
        }
      }
      const targetIndex = (y * targetWidth + x) * 4;
      target[targetIndex] = Math.round(totals[0] / (factor * factor));
      target[targetIndex + 1] = Math.round(totals[1] / (factor * factor));
      target[targetIndex + 2] = Math.round(totals[2] / (factor * factor));
      target[targetIndex + 3] = Math.round(totals[3] / (factor * factor));
    }
  }

  return target;
}

function encodePng(pixels, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width * 4; x += 1) {
      raw[rowStart + 1 + x] = pixels[y * width * 4 + x];
    }
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", Buffer.concat([
      uint32(width),
      uint32(height),
      Buffer.from([8, 6, 0, 0, 0]),
    ])),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(Buffer.concat([typeBuffer, data]))),
  ]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function mixColor(from, to, amount) {
  return from.map((value, index) => Math.round(value + (to[index] - value) * amount));
}

function gradientStop(stops, amount) {
  const scaled = amount * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  return mixColor(stops[index], stops[index + 1], scaled - index);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
