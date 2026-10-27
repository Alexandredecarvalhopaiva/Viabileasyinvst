const clamp = value => Math.min(1, Math.max(0, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** Exploded poses are a presentation device, never inputs to area/height calculations. */
export function floorPose(index, count, spread, floorHeight) {
  const amount = clamp(spread);
  return {
    x: Math.sin(index * .72) * 3.2 * amount,
    y: index * floorHeight + (5 + index * 2.4) * amount,
    z: Math.cos(index * .65) * 1.8 * amount,
    rotation: (index - count * .35) * .115 * amount,
  };
}

/** Bottom-up assembly, with a short suspended pose before each floor settles. */
export function assemblySpread(progress, index, count) {
  return 1 - smooth((clamp(progress) * 1.55 - index / Math.max(1, count) * .55) / 1);
}
