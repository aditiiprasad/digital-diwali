import type { Scene } from './scene';

type Toast = (message: string) => void;

interface Product {
  id: string;
  name: string;
  price: number;
  icon: string;
}

interface Shop {
  name: string;
  subtitle: string;
  products: Product[];
  x: number;
  y: number;
}

const SHOPS: Shop[] = [
  {
    name: 'Patakha Shop',
    subtitle: 'Digital fireworks, zero smoke',
    x: 13,
    y: 77,
    products: [
      { id: 'rocket', name: 'Sky Rocket', price: 120, icon: '🚀' },
      { id: 'chakri', name: 'Rainbow Chakri', price: 80, icon: '🌀' },
      { id: 'fuljhadi', name: 'Fuljhadi Pack', price: 60, icon: '✨' },
    ],
  },
  {
    name: 'Mithai Shop',
    subtitle: 'Fresh festive sweetness',
    x: 31,
    y: 75,
    products: [
      { id: 'laddu', name: 'Motichoor Laddu', price: 90, icon: '🍡' },
      { id: 'jalebi', name: 'Hot Jalebi', price: 70, icon: '🥨' },
      { id: 'kaju', name: 'Kaju Katli', price: 150, icon: '🍬' },
    ],
  },
  {
    name: 'Diya Shop',
    subtitle: 'Hand-painted light for every home',
    x: 50,
    y: 77,
    products: [
      { id: 'clay-diya', name: 'Clay Diya Set', price: 110, icon: '🪔' },
      { id: 'brass-diya', name: 'Brass Diya', price: 220, icon: '🕯️' },
      { id: 'oil', name: 'Mustard Oil', price: 45, icon: '🫙' },
    ],
  },
  {
    name: 'Decoration Shop',
    subtitle: 'Make the gali glow',
    x: 69,
    y: 75,
    products: [
      { id: 'toran', name: 'Mango Toran', price: 180, icon: '🌿' },
      { id: 'lights', name: 'Fairy Lights', price: 260, icon: '💡' },
      { id: 'rangoli', name: 'Rangoli Colours', price: 130, icon: '🎨' },
    ],
  },
  {
    name: 'Paan & Chai Shop',
    subtitle: 'A warm cup and a little gossip',
    x: 87,
    y: 77,
    products: [
      { id: 'chai', name: 'Kulhad Chai', price: 35, icon: '☕' },
      { id: 'paan', name: 'Meetha Paan', price: 55, icon: '🍃' },
      { id: 'samosa', name: 'Samosa', price: 40, icon: '🥟' },
    ],
  },
];

const COLORS = ['#ff4d6d', '#ff922b', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac', '#fff3bf'];

export class InteractiveFestival {
  private readonly root: HTMLDivElement;
  private readonly character: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly diyas: HTMLButtonElement[] = [];
  private readonly keys = new Set<string>();
  private readonly cart = new Map<string, { product: Product; quantity: number }>();
  private readonly litDiyas = new Set<number>();
  private readonly scene: Scene;
  private readonly toast: Toast;
  private x = 50;
  private y = 82;
  private direction = 'front';
  private interactTarget: { type: 'shop' | 'diya'; index: number } | null = null;
  private shopModal: HTMLDivElement | null = null;
  private rangoliModal: HTMLDivElement | null = null;
  private rangoliCanvas: HTMLCanvasElement | null = null;
  private rangoliCtx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private lastPoint: { x: number; y: number } | null = null;
  private brushColor = COLORS[0];
  private brushSize = 8;
  private erasing = false;
  private undoStack: ImageData[] = [];
  private redoStack: ImageData[] = [];

  constructor(scene: Scene, toast: Toast) {
    this.scene = scene;
    this.toast = toast;
    this.root = document.createElement('div');
    this.root.className = 'interactive-layer';
    scene.el.appendChild(this.root);
    this.character = document.createElement('div');
    this.character.className = 'festival-character';
    this.character.innerHTML = '<span class="character-shadow"></span><span class="character-body">🧑🏽‍🎨</span>';
    this.root.appendChild(this.character);
    this.prompt = document.createElement('div');
    this.prompt.className = 'interaction-prompt';
    this.root.appendChild(this.prompt);
    this.addDiyas();
    this.addShopMarkers();
    this.addControls();
    this.bindInput();
    this.layout();
    window.addEventListener('resize', () => this.layout());
  }

  private addDiyas() {
    const positions = [
      [8, 77], [15, 88], [22, 75], [29, 91], [36, 78], [43, 88], [50, 76], [57, 91],
      [64, 77], [71, 89], [78, 75], [85, 90], [92, 78], [12, 68], [25, 70], [38, 67],
      [62, 67], [75, 69], [88, 67], [18, 83], [32, 84], [46, 82], [55, 84], [69, 83],
      [82, 84], [6, 92], [19, 94], [81, 94], [94, 92], [50, 94],
    ];
    positions.forEach(([x, y], index) => {
      const diya = document.createElement('button');
      diya.type = 'button';
      diya.className = 'street-diya';
      diya.dataset.index = String(index);
      diya.style.left = `${x}%`;
      diya.style.top = `${y}%`;
      diya.innerHTML = '<span class="diya-flame">🔥</span><span class="diya-bowl">🪔</span>';
      diya.title = 'Light this diya';
      diya.addEventListener('click', () => this.toggleDiya(index));
      this.root.appendChild(diya);
      this.diyas.push(diya);
    });
  }

  private addShopMarkers() {
    SHOPS.forEach((shop, index) => {
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'shop-marker';
      marker.style.left = `${shop.x}%`;
      marker.style.top = `${shop.y}%`;
      marker.innerHTML = `<span class="shop-marker-icon">${shop.name === 'Paan & Chai Shop' ? '☕' : shop.name === 'Mithai Shop' ? '🍬' : shop.name === 'Diya Shop' ? '🪔' : shop.name === 'Decoration Shop' ? '🌼' : '🎆'}</span><span>${shop.name}</span>`;
      marker.addEventListener('click', () => this.openShop(index));
      this.root.appendChild(marker);
    });
  }

  private addControls() {
    const controls = document.createElement('div');
    controls.className = 'festival-actions';
    controls.innerHTML = '<button type="button" class="festival-action" data-action="shops">🏪 Shops</button><button type="button" class="festival-action" data-action="rangoli">🎨 Rangoli</button><span class="diya-progress" aria-live="polite">Diyas 0/30</span>';
    document.getElementById('app')!.appendChild(controls);
    controls.querySelector('[data-action="shops"]')!.addEventListener('click', () => this.openShop(0));
    controls.querySelector('[data-action="rangoli"]')!.addEventListener('click', () => this.openRangoli());
    this.progressEl = controls.querySelector('.diya-progress') as HTMLSpanElement;
    const joystick = document.createElement('div');
    joystick.className = 'mobile-joystick';
    joystick.innerHTML = '<button data-key="ArrowUp" aria-label="Move up">▲</button><div><button data-key="ArrowLeft" aria-label="Move left">◀</button><button data-key="ArrowDown" aria-label="Move down">▼</button><button data-key="ArrowRight" aria-label="Move right">▶</button></div>';
    document.getElementById('app')!.appendChild(joystick);
    joystick.querySelectorAll('button').forEach((button) => {
      const key = button.dataset.key!;
      const start = (event: Event) => { event.preventDefault(); this.keys.add(key); };
      const stop = (event: Event) => { event.preventDefault(); this.keys.delete(key); };
      button.addEventListener('pointerdown', start);
      button.addEventListener('pointerup', stop);
      button.addEventListener('pointercancel', stop);
      button.addEventListener('pointerleave', stop);
    });
  }

  private progressEl!: HTMLSpanElement;

  private bindInput() {
    window.addEventListener('keydown', (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
        event.preventDefault();
        this.keys.add(key);
      }
      if (key === 'e') this.interact();
      if (key === 'Escape') this.closeModals();
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    });
  }

  update(dt: number) {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('a') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('w') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('ArrowDown')) dy += 1;
    if (dx || dy) {
      const length = Math.hypot(dx, dy) || 1;
      const speed = 16 * dt / length;
      const nextX = this.x + dx * speed;
      const nextY = this.y + dy * speed;
      const minY = (this.scene.roadTop / Math.max(1, this.scene.height)) * 100 + 3;
      const maxY = (this.scene.roadBottom / Math.max(1, this.scene.height)) * 100 - 3;
      const blocked = SHOPS.some((shop) => Math.abs(nextX - shop.x) < 6 && Math.abs(nextY - shop.y) < 6);
      if (!blocked) {
        this.x = Math.max(4, Math.min(96, nextX));
        this.y = Math.max(minY, Math.min(maxY, nextY));
      }
      if (Math.abs(dx) > Math.abs(dy)) this.direction = dx < 0 ? 'left' : 'right';
      else this.direction = dy < 0 ? 'back' : 'front';
      this.character.classList.add('walking');
    } else {
      this.character.classList.remove('walking');
    }
    this.character.style.left = `${this.x}%`;
    this.character.style.top = `${this.y}%`;
    this.character.dataset.direction = this.direction;
    this.updateTarget();
  }

  private updateTarget() {
    let closest: { type: 'shop' | 'diya'; index: number; distance: number } = { type: 'diya', index: -1, distance: Infinity };
    SHOPS.forEach((shop, index) => {
      const distance = Math.hypot(this.x - shop.x, this.y - shop.y);
      if (distance < 10 && distance < closest.distance) closest = { type: 'shop', index, distance };
    });
    this.diyas.forEach((_, index) => {
      const diya = this.diyas[index];
      const distance = Math.hypot(this.x - parseFloat(diya.style.left), this.y - parseFloat(diya.style.top));
      if (distance < 7 && !this.litDiyas.has(index) && distance < closest.distance) closest = { type: 'diya', index, distance };
    });
    this.interactTarget = closest;
    const target = closest.distance === Infinity ? null : closest;
    if (!target) {
      this.prompt.classList.remove('show');
      return;
    }
    this.prompt.textContent = target.type === 'shop' ? `Press E to visit ${SHOPS[target.index].name}` : 'Press E to light diya';
    this.prompt.style.left = `${target.type === 'shop' ? SHOPS[target.index].x : parseFloat(this.diyas[target.index].style.left)}%`;
    this.prompt.style.top = `${target.type === 'shop' ? SHOPS[target.index].y - 7 : parseFloat(this.diyas[target.index].style.top) - 6}%`;
    this.prompt.classList.add('show');
  }

  private interact() {
    if (!this.interactTarget) {
      this.toast('Walk closer to a shop or diya.');
      return;
    }
    if (this.interactTarget.type === 'shop') this.openShop(this.interactTarget.index);
    else this.toggleDiya(this.interactTarget.index);
  }

  private toggleDiya(index: number) {
    if (this.litDiyas.has(index)) {
      this.litDiyas.delete(index);
      this.diyas[index].classList.remove('lit');
    } else {
      this.litDiyas.add(index);
      this.diyas[index].classList.add('lit');
      this.toast('Diya lit! May your home glow bright.');
    }
    this.progressEl.textContent = `Diyas ${this.litDiyas.size}/30`;
    if (this.litDiyas.size === 30) this.toast('🪔 All 30 diyas are glowing! Shubh Deepavali!');
  }

  private openShop(index: number) {
    this.closeModals();
    const shop = SHOPS[index];
    const modal = this.modalShell('shop-modal');
    modal.innerHTML = `<div class="modal-card shop-card"><button class="modal-close" aria-label="Close">×</button><div class="shop-dialogue"><strong>${shop.name}</strong><span>“${shop.subtitle}. Welcome, beta!”</span></div><div class="product-grid">${shop.products.map((product) => `<article class="product-card"><div class="product-image" role="img" aria-label="${product.name}">${product.icon}</div><strong>${product.name}</strong><span>₹${product.price}</span><button type="button" data-product="${product.id}">Add to cart</button></article>`).join('')}</div><div class="cart-panel"><strong>🛒 Cart</strong><div class="cart-items"></div><div class="cart-total">Total: ₹0</div><button type="button" class="checkout-button">Pack my festive basket</button></div><button type="button" class="return-street">← Return to street</button></div>`;
    modal.querySelector('.modal-close')!.addEventListener('click', () => this.closeModals());
    modal.querySelector('.return-street')!.addEventListener('click', () => this.closeModals());
    modal.querySelectorAll<HTMLButtonElement>('[data-product]').forEach((button) => button.addEventListener('click', () => {
      const product = shop.products.find((item) => item.id === button.dataset.product)!;
      const existing = this.cart.get(product.id);
      this.cart.set(product.id, { product, quantity: (existing?.quantity ?? 0) + 1 });
      this.renderCart(modal);
    }));
    modal.querySelector('.checkout-button')!.addEventListener('click', () => this.toast(this.cart.size ? 'Basket packed! Your virtual order is ready.' : 'Add something delicious first.'));
    this.renderCart(modal);
    this.shopModal = modal;
  }

  private renderCart(modal: HTMLDivElement) {
    const items = modal.querySelector('.cart-items')!;
    const entries = [...this.cart.values()];
    items.innerHTML = entries.length ? entries.map(({ product, quantity }) => `<div><span>${product.icon} ${product.name} × ${quantity}</span><button type="button" data-remove="${product.id}" aria-label="Remove ${product.name}">−</button></div>`).join('') : '<em>Your cart is waiting for a little Diwali magic.</em>';
    entries.forEach(({ product }) => items.querySelector(`[data-remove="${product.id}"]`)?.addEventListener('click', () => {
      const entry = this.cart.get(product.id)!;
      if (entry.quantity > 1) entry.quantity -= 1;
      else this.cart.delete(product.id);
      this.renderCart(modal);
    }));
    const total = entries.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0);
    modal.querySelector('.cart-total')!.textContent = `Total: ₹${total}`;
  }

  private openRangoli() {
    this.closeModals();
    const modal = this.modalShell('rangoli-modal');
    modal.innerHTML = `<div class="modal-card rangoli-card"><button class="modal-close" aria-label="Close">×</button><div class="rangoli-heading"><div><h2>Rangoli Creator</h2><p>Draw a little welcome for Lakshmi.</p></div><div class="rangoli-tools"><button data-tool="undo">↶</button><button data-tool="redo">↷</button><button data-tool="clear">Clear</button><button data-tool="eraser">Eraser</button><label>Brush <input type="range" min="2" max="35" value="8" /></label></div></div><div class="palette">${COLORS.map((color) => `<button type="button" style="background:${color}" data-color="${color}" aria-label="Choose ${color}"></button>`).join('')}</div><div class="templates"><span>Templates:</span><button data-template="flower">🌸 Flower</button><button data-template="mandala">◉ Mandala</button><button data-template="diya">🪔 Diya</button><button data-template="geometric">◇ Geometric</button></div><canvas class="rangoli-canvas" width="900" height="560"></canvas><div class="rangoli-footer"><button class="download-rangoli">Download PNG</button><button class="return-street">Return to street</button></div></div>`;
    this.rangoliModal = modal;
    this.rangoliCanvas = modal.querySelector('.rangoli-canvas')!;
    this.rangoliCtx = this.rangoliCanvas.getContext('2d')!;
    this.rangoliCtx.fillStyle = '#190d2c';
    this.rangoliCtx.fillRect(0, 0, this.rangoliCanvas.width, this.rangoliCanvas.height);
    this.bindRangoli(modal);
  }

  private bindRangoli(modal: HTMLDivElement) {
    const canvas = this.rangoliCanvas!;
    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
    };
    const begin = (event: PointerEvent) => {
      this.saveCanvas();
      this.drawing = true;
      this.lastPoint = point(event);
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!this.drawing || !this.lastPoint) return;
      const next = point(event);
      const ctx = this.rangoliCtx!;
      ctx.strokeStyle = this.erasing ? '#190d2c' : this.brushColor;
      ctx.lineWidth = this.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
      this.lastPoint = next;
    };
    const end = () => { this.drawing = false; this.lastPoint = null; };
    canvas.addEventListener('pointerdown', begin);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    modal.querySelector('.modal-close')!.addEventListener('click', () => this.closeModals());
    modal.querySelector('.return-street')!.addEventListener('click', () => this.closeModals());
    modal.querySelector('.download-rangoli')!.addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = 'my-diwali-rangoli.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      this.toast('Your rangoli PNG is ready!');
    });
    modal.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((button) => button.addEventListener('click', () => {
      this.brushColor = button.dataset.color!;
      this.erasing = false;
    }));
    modal.querySelector<HTMLInputElement>('input[type="range"]')!.addEventListener('input', (event) => {
      this.brushSize = Number((event.target as HTMLInputElement).value);
    });
    modal.querySelector('[data-tool="eraser"]')!.addEventListener('click', () => { this.erasing = !this.erasing; });
    modal.querySelector('[data-tool="clear"]')!.addEventListener('click', () => { this.saveCanvas(); this.rangoliCtx!.fillStyle = '#190d2c'; this.rangoliCtx!.fillRect(0, 0, canvas.width, canvas.height); });
    modal.querySelector('[data-tool="undo"]')!.addEventListener('click', () => this.restoreCanvas(this.undoStack, this.redoStack));
    modal.querySelector('[data-tool="redo"]')!.addEventListener('click', () => this.restoreCanvas(this.redoStack, this.undoStack));
    modal.querySelectorAll<HTMLButtonElement>('[data-template]').forEach((button) => button.addEventListener('click', () => this.drawTemplate(button.dataset.template!)));
  }

  private saveCanvas() {
    if (!this.rangoliCanvas || !this.rangoliCtx) return;
    this.undoStack.push(this.rangoliCtx.getImageData(0, 0, this.rangoliCanvas.width, this.rangoliCanvas.height));
    if (this.undoStack.length > 20) this.undoStack.shift();
    this.redoStack = [];
  }

  private restoreCanvas(from: ImageData[], to: ImageData[]) {
    if (!from.length || !this.rangoliCtx) return;
    const current = this.rangoliCtx.getImageData(0, 0, this.rangoliCanvas!.width, this.rangoliCanvas!.height);
    to.push(current);
    this.rangoliCtx.putImageData(from.pop()!, 0, 0);
  }

  private drawTemplate(template: string) {
    if (!this.rangoliCtx || !this.rangoliCanvas) return;
    this.saveCanvas();
    const ctx = this.rangoliCtx;
    const cx = this.rangoliCanvas.width / 2;
    const cy = this.rangoliCanvas.height / 2;
    ctx.strokeStyle = this.brushColor;
    ctx.lineWidth = 6;
    ctx.beginPath();
    if (template === 'flower') {
      for (let i = 0; i < 12; i++) {
        ctx.ellipse(cx, cy, 60 + i * 8, 170 + i * 10, i * Math.PI / 6, 0, Math.PI * 2);
      }
    } else if (template === 'mandala') {
      for (let radius = 30; radius < 230; radius += 35) ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    } else if (template === 'diya') {
      ctx.ellipse(cx, cy + 40, 190, 65, 0, 0, Math.PI * 2);
      ctx.moveTo(cx - 190, cy + 40); ctx.quadraticCurveTo(cx, cy + 170, cx + 190, cy + 40);
      ctx.moveTo(cx, cy - 20); ctx.quadraticCurveTo(cx - 45, cy - 120, cx, cy - 180); ctx.quadraticCurveTo(cx + 45, cy - 120, cx, cy - 20);
    } else {
      ctx.rect(cx - 190, cy - 190, 380, 380);
      ctx.moveTo(cx - 190, cy); ctx.lineTo(cx, cy - 190); ctx.lineTo(cx + 190, cy); ctx.lineTo(cx, cy + 190); ctx.closePath();
    }
    ctx.stroke();
  }

  private modalShell(className: string) {
    const modal = document.createElement('div');
    modal.className = `festival-modal ${className}`;
    modal.addEventListener('click', (event) => { if (event.target === modal) this.closeModals(); });
    document.getElementById('app')!.appendChild(modal);
    return modal;
  }

  private closeModals() {
    this.shopModal?.remove();
    this.rangoliModal?.remove();
    this.shopModal = null;
    this.rangoliModal = null;
    this.rangoliCanvas = null;
    this.rangoliCtx = null;
  }

  private layout() {
    this.character.style.left = `${this.x}%`;
    this.character.style.top = `${this.y}%`;
  }
}
