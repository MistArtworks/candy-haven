// The consultation engine: what a producer's feedback is (params), the
// check it passes (spec), when its sections and ducks fall (schedule), the
// EQ's picture (scale), the tools in words (describe) and the waveform
// that travels with the page (peaks). Pure: no React, no DOM, no audio.
// The Web Audio graph and the canvas drawing live beside it, in ../audio.
//
// Shared with Candy Haven: this folder is copied there as it is (Haven's
// `npm run sync:consult`), so it imports nothing outside itself except
// zod. Edit it here.

export * from './params';
export * from './spec';
export * from './schedule';
export * from './scale';
export * from './describe';
export * from './peaks';
