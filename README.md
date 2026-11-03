# Digital Diwali ✨🪔

An interactive, browser-based Diwali street experience built with **TypeScript**, **Vite**, HTML, CSS, and Canvas APIs. Explore the festive gali, light diyas, visit local shops, create rangoli, play patakas, and enjoy the original ambient atmosphere.

![Digital Diwali — festive pataka gali](public/assests/images/image.png)

## Live Demo

**[Play Digital Diwali](https://digital-diwali.vercel.app)**

## Experience the Gali

### 🧑🏽‍🎨 Explore with a character

- Move around the street with **WASD** or **arrow keys**.
- Use the on-screen directional controls on mobile.
- Smooth walking animation and direction changes.
- Movement stays inside the playable road area.
- Shops and street objects act as interaction points.
- Walk close to an object and press **E** when the interaction prompt appears.

### 🏪 Visit interactive shops

Five festive shops are available:

- **Patakha Shop** — digital fireworks and fuljhadi
- **Mithai Shop** — laddus, jalebi, and kaju katli
- **Diya Shop** — clay diyas, brass diyas, and oil
- **Decoration Shop** — torans, fairy lights, and rangoli colours
- **Paan & Chai Shop** — chai, paan, and samosas

Every shop includes a shopkeeper welcome message, product cards, virtual prices, add/remove cart actions, total calculation, and a festive basket confirmation. There is no real payment system.

### 🎨 Create a rangoli

Open the **Rangoli Creator** from the bottom controls to:

- Draw with mouse, stylus, or touch.
- Choose from colourful palettes.
- Adjust brush size.
- Use an eraser.
- Undo and redo strokes.
- Clear the canvas.
- Start with flower, mandala, diya, or geometric templates.
- Download the finished design as a PNG.

### 🪔 Light the street diyas

- Light **30 interactive diyas** by clicking or walking near them.
- Use **E** for character-based interaction.
- Enjoy animated flames, golden glow, and flickering effects.
- Toggle any diya on or off.
- Track progress with the live counter.
- Receive a celebration message when all 30 diyas are glowing.

### 🎆 Original Diwali atmosphere

The original experience remains available:

- Drag patakas from the shop shelf onto the road.
- Tap patakas to light them.
- Hold and move the fuljhadi to draw sparks.
- Toggle rain and weather audio.
- Control sound and street ambience.
- Open and use the Gali Radio.
- Enjoy fairy lights, fireworks, particles, parallax, and responsive layouts.

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | `W`, `A`, `S`, `D` or arrow keys | On-screen directional pad |
| Interact | `E` near a shop or diya | Tap the object |
| Visit shops | Click a shop marker or `🏪 Shops` | Tap a shop marker or `🏪 Shops` |
| Rangoli | Click `🎨 Rangoli` | Tap `🎨 Rangoli` |
| Close overlays | `Escape` or close button | Close button |
| Light patakas | Drag to road, then tap | Touch and drag |

## Tech Stack

- **TypeScript** with strict type checking
- **Vite** for development and production builds
- **Canvas 2D** for effects, particles, and rangoli drawing
- **HTML/CSS DOM layers** for controls, shops, character, diyas, and modals
- Web Audio-based ambience and effects
- Responsive desktop and mobile layouts

## Project Structure

```text
src/
├── interactive.ts          # Character, shops, cart, rangoli, diyas, mobile controls
├── main.ts                # App bootstrap and animation loop
├── scene.ts               # Street scene layout and atmosphere
├── patakas/               # Firework interactions and effects
├── radio/                 # Gali Radio player
├── weather/               # Rain visuals and audio
├── particles/             # Particle and glow effects
├── audio/                 # Audio manager and generated sound effects
├── landing/               # Landing screen and entrance transition
├── assets.ts              # Image/audio asset loading and fallbacks
└── styles.css             # Scene, responsive UI, and interactive feature styles
```

## Run Locally

Requirements: Node.js 18+ and npm.

```bash
git clone https://github.com/nandubodra/digital-diwali.git
cd digital-diwali
npm install
npm run dev
```

Open the local URL shown by Vite, then select **Enter the Gali**.

## Build and Preview

```bash
npm run typecheck
npm run build
npm run preview
```

The production build is generated in `dist/`.

## Deployment

The project is a standard Vite static site and can be deployed to Vercel, Netlify, GitHub Pages, or any static hosting provider.

For Vercel:

1. Import the repository.
2. Use `npm run build` as the build command.
3. Use `dist` as the output directory.

## Development Branch

The enhanced interactive version is developed on:

```text
feature/interactive-diwali
```

The original upstream project remains unchanged:

```text
https://github.com/aditiiprasad/digital-diwali
```

## Credits and Safety

Original project and visual direction by [Aditi Prasad](https://www.linkedin.com/in/aditiiprasad).

This is a playful digital celebration. Enjoy an eco-friendly Diwali and celebrate responsibly—no real fireworks or payment transactions are involved. 🎆
