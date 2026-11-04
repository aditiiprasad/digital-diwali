import { drawSprite, type Behavior, type PatakaDef, type Placed, type World } from './types';

const DiyaBehavior: Behavior = {
  update() {
    return true;
  },
  draw(ctx) {
    // The diya's warm pool is submitted by the manager's active draw path.
    void ctx;
  },
  stop() {},
};

export const Diya: PatakaDef = {
  kind: 'diya',
  hi: 'दीया',
  en: 'Diya',
  image: 'diya',
  heightMul: 0.62,
  fuseTip: [0.5, 0.15],
  hint: 'Tap to light the diya 🪔',
  create(p: Placed, world: World) {
    return {
      ...DiyaBehavior,
      update() {
        const h = world.baseSize * p.def.heightMul * world.depthScale(p.y);
        const glowY = p.y - h * 0.45;
        world.fx.glow(p.x, glowY, 42 * world.depthScale(p.y) * world.unit, '255,174,62', 0.72);
        return true;
      },
      draw(ctx) {
        const h = world.baseSize * p.def.heightMul * world.depthScale(p.y);
        drawSprite(ctx, world.image(p.def.image), p.x, p.y - p.hop, h, p.def.restRot ?? 0);
        world.fx.glow(p.x, p.y - h * 0.72, 24 * world.unit, '255,210,110', 0.8);
      },
    };
  },
};
