import { Anaar } from './Anaar';
import { AtomBomb } from './AtomBomb';
import { Chakri } from './Chakri';
import { Fuljhadi } from './Fuljhadi';
import { Diya } from './Diya';
import { Rocket } from './Rocket';
import type { PatakaDef, PatakaKind } from './types';

/** Shop order. */
export const PATAKAS: PatakaDef[] = [Diya, Anaar, Rocket, Chakri, AtomBomb, Fuljhadi];

export const PATAKA_BY_KIND = Object.fromEntries(PATAKAS.map((d) => [d.kind, d])) as Record<PatakaKind, PatakaDef>;
