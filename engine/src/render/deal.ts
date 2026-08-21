import { makeRng } from '../core/rng.js';

const cache = new Map<string, number[]>();

/** Which image each tile gets, for a theme backed by a real image set.
 *
 *  This lives on its own because two places need the same answer: the art layer,
 *  which draws the picture, and the label resolver, which has to print that
 *  picture's actual title under it. A second shuffle would put "Inglis Falls"
 *  under the canola field. */
export function dealFor(labelSeed: string, count: number): number[] {
  const key = `${labelSeed}|${count}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const order = makeRng(`${labelSeed}|images`).shuffle(Array.from({ length: count }, (_, i) => i));
  cache.set(key, order);
  return order;
}
