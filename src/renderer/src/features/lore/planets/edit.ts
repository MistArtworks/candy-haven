import {
  LAYER_TYPES,
  MAX_LAYERS,
  evenList,
  layerSchema,
  newLayer,
  newLayerId,
  newSeed,
  type Layer,
  type LayerParams,
  type LayerType,
  type ParamDef,
  type PlanetSpec
} from '@shared/planets/engine'

/*
 * The planet editor's changes, as plain functions from one planet to the
 * next: the page keeps the planet being made and an undo trail of earlier
 * ones, and every button is one of these. Pure, so what Shuffle does can be
 * read in one place.
 */

/** A layer's own controls, with any change to them checked by the engine's schema. */
export function withLayer(spec: PlanetSpec, id: string, patch: Partial<Layer>): PlanetSpec {
  return {
    ...spec,
    layers: spec.layers.map((layer) =>
      layer.id === id ? layerSchema.parse({ ...layer, ...patch }) : layer
    )
  }
}

export function withParams(spec: PlanetSpec, id: string, params: LayerParams): PlanetSpec {
  const layer = spec.layers.find((l) => l.id === id)
  return layer ? withLayer(spec, id, { params: { ...layer.params, ...params } }) : spec
}

/** A new layer of a type, on top of the rest. */
export function withNewLayer(spec: PlanetSpec, type: LayerType): { spec: PlanetSpec; id: string } {
  const layer = newLayer(type, newSeed())
  if (spec.layers.length >= MAX_LAYERS) return { spec, id: '' }
  return { spec: { ...spec, layers: [...spec.layers, layer] }, id: layer.id }
}

/** A copy of a layer, just above it. */
export function withCopy(spec: PlanetSpec, id: string): { spec: PlanetSpec; id: string } {
  const at = spec.layers.findIndex((layer) => layer.id === id)
  if (at < 0 || spec.layers.length >= MAX_LAYERS) return { spec, id: '' }
  const source = spec.layers[at]
  const copy: Layer = {
    ...source,
    id: newLayerId(),
    name: source.name ? `${source.name} copy` : '',
    locked: false,
    params: structuredClone(source.params)
  }
  const layers = [...spec.layers]
  layers.splice(at + 1, 0, copy)
  return { spec: { ...spec, layers }, id: copy.id }
}

export function without(spec: PlanetSpec, id: string): PlanetSpec {
  return { ...spec, layers: spec.layers.filter((layer) => layer.id !== id) }
}

/** The layers in a new order, bottom first, as they're drawn. */
export function inOrder(spec: PlanetSpec, ids: readonly string[]): PlanetSpec {
  const byId = new Map(spec.layers.map((layer) => [layer.id, layer]))
  const layers = ids.flatMap((id) => byId.get(id) ?? [])
  return layers.length === spec.layers.length ? { ...spec, layers } : spec
}

// ----------------------------------------------------------------- shuffle

/** A number somewhere near another, inside a range: within a third of the range either way. */
function near(value: number, min: number, max: number, step = 0): number {
  const reach = (max - min) / 3
  const raw = Math.min(max, Math.max(min, value + (Math.random() * 2 - 1) * reach))
  if (!step) return raw
  return Number((Math.round(raw / step) * step).toFixed(4))
}

/**
 * A layer shuffled: a new seed, which redraws everything random about it
 * (where veins run, which craters, the noise), and its shape controls
 * moved somewhere near where they were. Colours, place, motion and the
 * switches stay as they are: those are choices, not chance.
 */
export function shuffled(layer: Layer): Layer {
  const params: LayerParams = { ...layer.params }
  for (const [key, def] of Object.entries(LAYER_TYPES[layer.type].params) as Array<
    [string, ParamDef]
  >) {
    const value = params[key]
    if (def.kind === 'number' && typeof value === 'number') {
      params[key] = near(value, def.min, def.max, def.step)
    } else if (def.kind === 'int' && typeof value === 'number') {
      params[key] = Math.round(near(value, def.min, def.max, 1))
    } else if (def.kind === 'list' && Array.isArray(value) && value.length) {
      const count = Math.round(near(value.length, 1, def.maxItems, 1))
      params[key] = evenList(def, count)
    }
  }
  return layerSchema.parse({ ...layer, seed: newSeed(), params })
}

/** Every layer that isn't locked, shuffled. */
export function shuffledAll(spec: PlanetSpec): PlanetSpec {
  return {
    ...spec,
    layers: spec.layers.map((layer) => (layer.locked ? layer : shuffled(layer)))
  }
}
