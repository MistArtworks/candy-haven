// The planet engine: what a planet is (spec), the shapes each layer type
// draws (layers), how they stack (draw) and the looks the lore began with
// (presets). Pure: no React, no DOM, no files. The renderer lives beside
// it, in ../react.
//
// Shared with Candy Haven: this folder is copied there as it is (Haven's
// `npm run sync:planets`), so it imports nothing outside itself except
// zod. Edit it here.

export * from './spec';
export * from './geometry';
export * from './draw';
export * from './presets';
export { EMBLEMS } from './emblems';
export { mulberry32, newSeed } from './random';
