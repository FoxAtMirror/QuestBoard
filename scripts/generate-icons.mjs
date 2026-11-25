// Генератор иконок приложения: рисуем PNG программно (без внешних библиотек).
// Получаем иконку окна/трей-бара и заготовку для electron-builder.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

/* ---------- минимальный PNG-энкодер ---------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- рисунок ---------- */

const GOLD = [217, 180, 99];
const GOLD_LIGHT = [246, 224, 164];
const STONE = [30, 23, 12];
const STONE_LIGHT = [56, 44, 24];

function shade(t) {
  // микс камня по вертикали
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(STONE_LIGHT[0] + (STONE[0] - STONE_LIGHT[0]) * k),
    Math.round(STONE_LIGHT[1] + (STONE[1] - STONE_LIGHT[1]) * k),
    Math.round(STONE_LIGHT[2] + (STONE[2] - STONE_LIGHT[2]) * k),
  ];
}

/** Рисуем знак «!» в круглом медальоне */
function draw(size) {
  const data = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const rOuter = size * 0.47;
  const rInner = size * 0.39;
  const samples = 4;

  const barW = size * 0.09;
  const barTop = size * 0.24;
  const barBottom = size * 0.56;
  const dotR = size * 0.065;
  const dotY = size * 0.69;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          const dx = px - c;
          const dy = py - c;
          const dist = Math.sqrt(dx * dx + dy * dy);

          let color = null;
          let alpha = 0;

          if (dist <= rOuter) {
            // кольцо
            if (dist >= rInner) {
              const t = (dist - rInner) / (rOuter - rInner);
              color = t < 0.5 ? GOLD_LIGHT : GOLD;
              alpha = 1;
            } else {
              color = shade((py / size) * 1.15);
              alpha = 1;
            }
          }

          // восклицательный знак
          const inBar = Math.abs(px - c) <= barW / 2 && py >= barTop && py <= barBottom;
          const inDot = Math.abs(px - c) <= barW / 2 && Math.abs(py - dotY) <= dotR;
          if (inBar || inDot) {
            color = GOLD_LIGHT;
            alpha = 1;
          }

          if (color) {
            r += color[0] * alpha;
            g += color[1] * alpha;
            b += color[2] * alpha;
            a += alpha;
          }
        }
      }

      const total = samples * samples;
      const i = (y * size + x) * 4;
      if (a > 0) {
        data[i] = Math.round(r / a);
        data[i + 1] = Math.round(g / a);
        data[i + 2] = Math.round(b / a);
        data[i + 3] = Math.round((a / total) * 255);
      }
    }
  }
  return encodePng(size, size, data);
}

mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', draw(512));
writeFileSync('build/tray.png', draw(32));
writeFileSync('build/icon-256.png', draw(256));
console.log('[icons] build/icon.png, build/icon-256.png, build/tray.png');
