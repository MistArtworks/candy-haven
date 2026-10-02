import {
  planetSpecSchema,
  type PlanetSpec,
  type PlanetSpecInput
} from './spec';

// The 11 looks the lore was designed with, as layer stacks: the planet as
// the storyboards draw it (a tilted grid, the fungal network, a gold core)
// with the overlay each chapter adds. Candy Haven offers them as starting
// points; a chapter written before planets could be edited names one by
// its look ("state" in the chapter files).

export const PRESET_STATES = [
  'network',
  'omun',
  'unity',
  'many',
  'disconnect',
  'sigil',
  'suppress',
  'order',
  'forget',
  'candy',
  'heist'
] as const;
export type PresetState = (typeof PRESET_STATES)[number];

export const PRESET_PREFIX = 'preset:';

export interface PlanetPreset {
  /** `preset:<look>`: how a chapter points at a preset rather than a saved planet. */
  id: string;
  state: PresetState;
  name: string;
  description: string;
  spec: PlanetSpec;
}

const DETAIL: Record<PresetState, { name: string; description: string }> = {
  network: {
    name: 'Network',
    description: 'The fungal network lit, from the core outwards.'
  },
  omun: {
    name: 'Omun',
    description: 'The crimson core of the resonance event.'
  },
  unity: { name: 'Nayarasam', description: 'One line through all of them.' },
  many: {
    name: 'Sentient life',
    description: 'The many lineages, the near ones linked.'
  },
  disconnect: { name: 'Disconnection', description: 'The signal breaking up.' },
  sigil: {
    name: 'Sonoalchemy',
    description: 'The sigil etched over the planet.'
  },
  suppress: { name: 'Suppression', description: 'Half of it struck out.' },
  order: {
    name: 'Modern society',
    description: 'The grid tightened, the network gone.'
  },
  forget: { name: 'Memory', description: 'A part of it missing.' },
  candy: {
    name: 'Candy',
    description: 'Crimson fragments scattered through it.'
  },
  heist: { name: 'Heist', description: 'The crimson core returns, ringed.' }
};

// How the fungal network reads in each look; 0 leaves it out.
const VEINS: Record<PresetState, number> = {
  network: 0.9,
  omun: 0.5,
  unity: 0.55,
  many: 0.3,
  disconnect: 0.4,
  sigil: 0.25,
  suppress: 0.42,
  order: 0,
  forget: 0.22,
  candy: 0.4,
  heist: 0.45
};

// The seeds the storyboards' generators used: the network's own, and the
// one every chapter overlay drew from.
const NETWORK_SEED = 31;
const OVERLAY_SEED = 77;

const OVERLAY: Partial<Record<PresetState, PlanetSpecInput['layers']>> = {
  unity: [{ id: 'beings', type: 'beings', seed: OVERLAY_SEED }],
  many: [{ id: 'constellation', type: 'constellation', seed: OVERLAY_SEED }],
  disconnect: [{ id: 'noise', type: 'noise', seed: OVERLAY_SEED }],
  sigil: [{ id: 'sigil', type: 'sigil', seed: OVERLAY_SEED }],
  suppress: [{ id: 'redactions', type: 'redactions', seed: OVERLAY_SEED }],
  forget: [{ id: 'missing', type: 'missing', seed: OVERLAY_SEED }],
  candy: [{ id: 'fragments', type: 'fragments', seed: OVERLAY_SEED }]
};

function presetSpec(state: PresetState): PlanetSpec {
  const crimson = state === 'omun' || state === 'heist';
  return planetSpecSchema.parse({
    layers: [
      state === 'order'
        ? {
            id: 'grid',
            type: 'grid',
            opacity: 0.3,
            params: {
              meridians: [0.15, 0.3, 0.45, 0.6, 0.75, 0.9],
              parallels: [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8]
            }
          }
        : { id: 'grid', type: 'grid' },
      ...(VEINS[state]
        ? [
            {
              id: 'veins',
              type: 'veins',
              seed: NETWORK_SEED,
              opacity: VEINS[state],
              width: state === 'network' ? 1.3 : 0.9,
              dash:
                state === 'disconnect' || state === 'forget'
                  ? 'dashed'
                  : 'solid'
            }
          ]
        : []),
      ...(OVERLAY[state] ?? []),
      {
        id: 'core',
        type: 'core',
        color: crimson ? '#c4453a' : '#d2a961',
        params: { size: crimson ? 0.04 : 0.025, ring: state === 'heist' }
      }
    ]
  });
}

export const PRESETS: readonly PlanetPreset[] = PRESET_STATES.map((state) => ({
  id: `${PRESET_PREFIX}${state}`,
  state,
  ...DETAIL[state],
  spec: presetSpec(state)
}));

export const isPresetId = (id: string) => id.startsWith(PRESET_PREFIX);

export function presetById(id: string): PlanetPreset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}

export function presetFor(state: PresetState): PlanetPreset {
  return PRESETS.find((preset) => preset.state === state) ?? PRESETS[0];
}

/** The planet the lore shows when there's no chapter to take one from. */
export const DEFAULT_PRESET = PRESETS[0];
