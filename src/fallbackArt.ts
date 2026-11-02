import type { ImageKey } from './assets';

/**
 * Procedurally drawn stand-ins for missing images. Proportions roughly match
 * the real artwork so fuse/nozzle anchor points still line up.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function fuse(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number) {
  ctx.strokeStyle = '#c9b48a';
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2 + w * 2, (y0 + y1) / 2, x1, y1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,60,30,0.6)';
  ctx.lineWidth = w * 0.35;
  ctx.setLineDash([w * 0.8, w * 0.8]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function street(): HTMLCanvasElement {
  const W = 1600, H = 656;
  const [c, ctx] = canvas(W, H);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#120c2c');
  sky.addColorStop(0.45, '#3a1f4d');
  sky.addColorStop(0.8, '#7a3b3b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Far skyline silhouette.
  ctx.fillStyle = '#24183a';
  let x = 0;
  while (x < W) {
    const bw = 60 + Math.random() * 90;
    const bh = 160 + Math.random() * 160;
    ctx.fillRect(x, H * 0.62 - bh, bw, bh + 40);
    x += bw;
  }

  // Near row of houses with lit windows and string lights.
  x = 0;
  const palette = ['#7a3b2a', '#8d4a2f', '#6e3326', '#94573a', '#5f2f2a'];
  while (x < W) {
    const bw = 180 + Math.random() * 120;
    const bh = 300 + Math.random() * 120;
    const top = H * 0.88 - bh;
    ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
    ctx.fillRect(x, top, bw, bh);
    ctx.fillStyle = '#4a2018';
    ctx.fillRect(x - 6, top - 14, bw + 12, 18);
    for (let wy = top + 40; wy < H * 0.8; wy += 70) {
      for (let wx = x + 22; wx < x + bw - 40; wx += 56) {
        ctx.fillStyle = Math.random() < 0.7 ? '#ffc56b' : '#3a2018';
        ctx.fillRect(wx, wy, 26, 36);
      }
    }
    for (let lx = x; lx < x + bw; lx += 14) {
      const ly = top + 6 + Math.sin(((lx - x) / bw) * Math.PI) * 18;
      ctx.fillStyle = ['#ffd36b', '#ff7a59', '#9cff8a', '#7ad7ff'][Math.floor(lx / 14) % 4];
      ctx.beginPath();
      ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    x += bw;
  }
  // Sidewalk with diyas.
  ctx.fillStyle = '#5d5560';
  ctx.fillRect(0, H * 0.88, W, H * 0.12);
  ctx.fillStyle = '#3f3a44';
  ctx.fillRect(0, H * 0.97, W, H * 0.03);
  for (let dx = 40; dx < W; dx += 120) {
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.ellipse(dx, H * 0.9, 6, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function shop(): HTMLCanvasElement {
  const W = 600, H = 420;
  const [c, ctx] = canvas(W, H);
  // Posts
  ctx.fillStyle = '#5b3a22';
  ctx.fillRect(90, 90, 22, 300);
  ctx.fillRect(488, 90, 22, 300);
  // Back wall
  ctx.fillStyle = '#3d2716';
  ctx.fillRect(112, 110, 376, 230);
  // Shelves with colourful boxes
  const boxColors = ['#d9442b', '#2b7bd9', '#e8b62c', '#36a852', '#a83ec9', '#ff7a2f'];
  for (let row = 0; row < 3; row++) {
    const sy = 150 + row * 62;
    ctx.fillStyle = '#7a4d2a';
    ctx.fillRect(112, sy + 40, 376, 8);
    for (let bx = 122; bx < 470; bx += 34) {
      ctx.fillStyle = boxColors[(bx + row * 3) % boxColors.length];
      const bh = 26 + ((bx * 7 + row * 13) % 14);
      ctx.fillRect(bx, sy + 40 - bh, 28, bh);
    }
  }
  // Tin roof
  ctx.fillStyle = '#8a8f96';
  ctx.beginPath();
  ctx.moveTo(50, 115);
  ctx.lineTo(550, 115);
  ctx.lineTo(500, 70);
  ctx.lineTo(100, 70);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#6b7077';
  for (let rx = 70; rx < 540; rx += 16) {
    ctx.beginPath();
    ctx.moveTo(rx, 115);
    ctx.lineTo(rx + (300 - rx) * 0.1, 72);
    ctx.stroke();
  }
  // Sign
  ctx.fillStyle = '#9b6a3c';
  ctx.fillRect(190, 10, 220, 62);
  ctx.strokeStyle = '#5b3a22';
  ctx.lineWidth = 4;
  ctx.strokeRect(190, 10, 220, 62);
  ctx.fillStyle = '#3a210f';
  ctx.font = 'bold 34px "Kohinoor Devanagari", "Noto Sans Devanagari", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('पटाखा दुकान', 300, 43);
  // Counter
  ctx.fillStyle = '#8a5a33';
  ctx.fillRect(200, 300, 300, 18);
  ctx.fillStyle = '#6e4526';
  ctx.fillRect(210, 318, 280, 80);
  // Hanging bulb glow
  const g = ctx.createRadialGradient(300, 140, 4, 300, 140, 140);
  g.addColorStop(0, 'rgba(255,220,140,0.9)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(160, 0, 280, 300);
  return c;
}

function anaar(): HTMLCanvasElement {
  const W = 220, H = 390;
  const [c, ctx] = canvas(W, H);
  const top = 80;
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#9c2f17');
  g.addColorStop(0.5, '#e0552a');
  g.addColorStop(1, '#8a2812');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(W * 0.38, top);
  ctx.lineTo(W * 0.62, top);
  ctx.lineTo(W * 0.98, H - 14);
  ctx.quadraticCurveTo(W * 0.5, H + 6, W * 0.02, H - 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d6a845';
  ctx.fillRect(W * 0.37, top - 8, W * 0.26, 14);
  ctx.fillRect(W * 0.04, H - 30, W * 0.92, 12);
  ctx.fillStyle = '#f3e3b5';
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.6, W * 0.24, H * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9c2f17';
  ctx.font = 'bold 30px "Kohinoor Devanagari", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('अनार', W * 0.5, H * 0.62);
  fuse(ctx, W * 0.5, top - 6, W * 0.68, 8, 7);
  return c;
}

function rocket(): HTMLCanvasElement {
  const W = 100, H = 490;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#d8b878';
  ctx.fillRect(W * 0.62, H * 0.2, 6, H * 0.8);
  const g = ctx.createLinearGradient(0, 0, W * 0.6, 0);
  g.addColorStop(0, '#1d3f8c');
  g.addColorStop(0.5, '#3a6fd8');
  g.addColorStop(1, '#1d3f8c');
  ctx.fillStyle = g;
  ctx.fillRect(W * 0.1, H * 0.16, W * 0.5, H * 0.34);
  ctx.fillStyle = '#e8a33a';
  for (let i = 0; i < 4; i++) ctx.fillRect(W * 0.1, H * (0.2 + i * 0.08), W * 0.5, 6);
  ctx.fillStyle = '#e7b93d';
  ctx.beginPath();
  ctx.moveTo(W * 0.04, H * 0.165);
  ctx.lineTo(W * 0.66, H * 0.165);
  ctx.lineTo(W * 0.35, 0);
  ctx.closePath();
  ctx.fill();
  fuse(ctx, W * 0.36, H * 0.5, W * 0.22, H * 0.64, 5);
  return c;
}

function chakri(): HTMLCanvasElement {
  const W = 560, H = 260;
  const [c, ctx] = canvas(W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(1, H / W);
  const R = W / 2 - 6;
  ctx.lineWidth = 20;
  for (let i = 0; i < 2; i++) {
    ctx.strokeStyle = i === 0 ? '#e23b2a' : '#f2c21b';
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 9; a += 0.05) {
      const r = (a / (Math.PI * 9)) * R + i * 11;
      const px = Math.cos(a + i * Math.PI) * r;
      const py = Math.sin(a + i * Math.PI) * r;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
  fuse(ctx, W * 0.5, H * 0.5, W * 0.57, H * 0.25, 8);
  return c;
}

function atomBomb(): HTMLCanvasElement {
  const W = 225, H = 417;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#6e1414');
  g.addColorStop(0.45, '#c22b22');
  g.addColorStop(1, '#5a1010');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(8, 90, W - 16, H - 96, 20);
  ctx.fill();
  ctx.fillStyle = '#9ea3a8';
  ctx.fillRect(W * 0.4, 72, W * 0.2, 24);
  ctx.strokeStyle = '#b89a62';
  ctx.lineWidth = 7;
  for (const y of [150, 330]) {
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(W - 8, y + 6);
    ctx.stroke();
  }
  ctx.fillStyle = '#efe0bd';
  ctx.fillRect(30, 180, W - 60, 120);
  ctx.fillStyle = '#8a1a14';
  ctx.font = 'bold 34px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATOM', W / 2, 230);
  ctx.fillText('BOMB', W / 2, 272);
  fuse(ctx, W * 0.5, 74, W * 0.73, 8, 8);
  return c;
}

/** Diagonal sparkler: bare wire handle bottom-left, coated rod up to the top-right. */
function fuljhadi(): HTMLCanvasElement {
  const W = 242, H = 402;
  const [c, ctx] = canvas(W, H);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#9aa0a6';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W * 0.03, H * 0.985);
  ctx.lineTo(W * 0.33, H * 0.68);
  ctx.stroke();
  ctx.strokeStyle = '#4a4d52';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(W * 0.33, H * 0.68);
  ctx.lineTo(W * 0.95, H * 0.03);
  ctx.stroke();
  ctx.fillStyle = 'rgba(200,205,210,0.35)';
  for (let i = 0; i < 40; i++) {
    const t = Math.random();
    ctx.beginPath();
    ctx.arc(W * (0.33 + 0.62 * t) + (Math.random() - 0.5) * 8, H * (0.68 - 0.65 * t) + (Math.random() - 0.5) * 8, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function radio(): HTMLCanvasElement {
  const W = 300, H = 230;
  const [c, ctx] = canvas(W, H);
  // Antenna
  ctx.strokeStyle = '#c9ccd1';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(220, 60);
  ctx.lineTo(270, 4);
  ctx.stroke();
  ctx.fillStyle = '#e9ecef';
  ctx.beginPath();
  ctx.arc(270, 4, 4, 0, Math.PI * 2);
  ctx.fill();
  // Handle
  ctx.strokeStyle = '#3b2414';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(80, 64);
  ctx.quadraticCurveTo(150, 10, 220, 64);
  ctx.stroke();
  // Body
  const g = ctx.createLinearGradient(0, 60, 0, H);
  g.addColorStop(0, '#a5642f');
  g.addColorStop(1, '#5e3317');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(10, 60, W - 20, H - 66, 26);
  ctx.fill();
  ctx.strokeStyle = '#3b2414';
  ctx.lineWidth = 5;
  ctx.stroke();
  // Speaker grille
  ctx.fillStyle = '#e8d7b0';
  ctx.beginPath();
  ctx.arc(95, 145, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6b4a2b';
  for (let gy = 95; gy < 200; gy += 10) {
    for (let gx = 45; gx < 150; gx += 10) {
      if ((gx - 95) ** 2 + (gy - 145) ** 2 < 52 ** 2) {
        ctx.beginPath();
        ctx.arc(gx, gy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Dial window
  ctx.fillStyle = '#f6e7b8';
  ctx.beginPath();
  ctx.roundRect(170, 95, 105, 44, 8);
  ctx.fill();
  ctx.strokeStyle = '#8a5a33';
  ctx.lineWidth = 1.5;
  for (let t = 178; t < 270; t += 8) {
    ctx.beginPath();
    ctx.moveTo(t, 100);
    ctx.lineTo(t, t % 16 === 2 ? 116 : 110);
    ctx.stroke();
  }
  ctx.strokeStyle = '#d23a1e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(220, 98);
  ctx.lineTo(220, 136);
  ctx.stroke();
  // Knobs
  for (const kx of [195, 250]) {
    ctx.fillStyle = '#2d1a0d';
    ctx.beginPath();
    ctx.arc(kx, 180, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d6a845';
    ctx.beginPath();
    ctx.arc(kx, 180, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function logo(): HTMLCanvasElement {
  const W = 680, H = 200;
  const [c, ctx] = canvas(W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const g = ctx.createLinearGradient(0, 40, 0, 160);
  g.addColorStop(0, '#fff2b0');
  g.addColorStop(0.5, '#ffb52e');
  g.addColorStop(1, '#d4630f');
  ctx.shadowColor = 'rgba(255,140,30,0.9)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = g;
  ctx.font = 'bold 84px "Kohinoor Devanagari", "Noto Sans Devanagari", Georgia, serif';
  ctx.fillText('शुभ दीपावली', W / 2, H / 2 + 6);
  return c;
}

export function fallbackImage(key: ImageKey): HTMLCanvasElement {
  switch (key) {
    case 'street': return street();
    case 'shop': return shop();
    case 'anaar': return anaar();
    case 'rocket': return rocket();
    case 'chakri': return chakri();
    case 'atomBomb': return atomBomb();
    case 'fuljhadi': return fuljhadi();
    case 'radio': return radio();
    case 'logo': return logo();
  }
}
