import {
  EQ_BAND_READS,
  type Chain,
  type Note,
  type Sidechain
} from '../engine/params';
import {
  DUCK_ATTACK,
  chainedSections,
  covers,
  duckFloor,
  duckRecovery,
  duckTimes,
  edgesBetween,
  type ChainedSection
} from '../engine/schedule';
import { filtersFor, tuneFilters } from './filters';

// The track, played through a producer's tools: each section he put tools
// on, switched in where it starts and out where it ends, then the tools on
// the whole song. The page builds one to play while he works; Candy Haven
// builds the same one to play his feedback back, so Candy hears exactly
// what he heard.
//
//   input ─┬─ bypass ─────────────────────────────────────┬─ output
//          └─ section ─ section ─ … ─ whole song ─ tools ──┘
//
// A section's tools are always connected, and faded between it and the
// plain sound at its edges, so moving through the track never rebuilds
// anything. The fades and the sidechain's ducks are scheduled ahead on the
// audio clock, a couple of seconds at a time, so they land where they
// should even while a browser slows the page's timers down.
//
// Moving a control doesn't rebuild anything either: while the tools keep
// their shape (the same points of the same kinds, the same tools on),
// their values glide to the new ones in place. Only adding or removing
// something rebuilds, which is a press, not a drag.

/** The tools to hear: a producer's sections, and those on the whole song. */
export interface Tools {
  notes: readonly Note[];
  chain: Chain | null;
}

export interface ConsultGraph {
  /** Connect the source here. */
  readonly input: AudioNode;
  /** Connect this onward: to an analyser, then the speakers. */
  readonly output: AudioNode;
  /** The tools to play through, or null for the track as it is. */
  set(tools: Tools | null): void;
  /** Play the track as it is without forgetting the tools: the A/B. */
  bypass(on: boolean): void;
  /**
   * Follow a media element's playhead, so sections and ducks land in time.
   * Answers the way to stop following.
   */
  follow(element: HTMLMediaElement): () => void;
  /** Everything disconnected; the graph can't be used again. */
  dispose(): void;
}

const dbToGain = (db: number) => 10 ** (db / 20);

/** How far past the playhead changes are scheduled, in seconds of track. */
const HORIZON = 2;
/** How often the schedule is topped up, in ms. */
const TICK_MS = 100;
/** The time constant of a switch: short enough to sound instant, long enough not to click. */
const SWITCH = 0.006;
/** The time constant a moved control glides to its new value on. */
const GLIDE = 0.015;
/** How far the playhead and the audio clock may part, in seconds, before the schedule is laid again. */
const DRIFT = 0.12;

/** The most drive saturation reaches: what its curve is drawn to take. */
const MAX_DRIVE = dbToGain(24);

const tanhCurves = new WeakMap<BaseAudioContext, Float32Array<ArrayBuffer>>();

/** tanh over the whole drive range, drawn once per context. */
function tanhCurve(context: BaseAudioContext): Float32Array<ArrayBuffer> {
  let curve = tanhCurves.get(context);
  if (!curve) {
    curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * MAX_DRIVE);
    }
    tanhCurves.set(context, curve);
  }
  return curve;
}

/** What a set of tools is made of, without its values: equal shapes, equal nodes. */
function shapeOf(chain: Chain | null): string {
  if (!chain) return '-';
  const bands = chain.eq
    .map((b) => (EQ_BAND_READS[b.type].slope ? `${b.type}${b.slope}` : b.type))
    .join(',');
  const tools = [
    chain.saturation && 's',
    chain.sidechain && 'c',
    chain.width && 'w',
    chain.dynamics && 'd'
  ];
  return `${bands}|${tools.filter(Boolean).join('')}`;
}

interface Duck {
  gain: AudioParam;
  sidechain: Sidechain;
}

interface Stage {
  input: AudioNode;
  output: AudioNode;
  ducks: Duck[];
  nodes: AudioNode[];
  shape: string;
  /** Moves every value to `chain`'s, which must have this stage's shape. */
  tune(chain: Chain | null): void;
}

type Apply = (param: AudioParam, value: number) => void;

/** Sets a value at once: for a stage being built. */
const place: Apply = (param, value) => {
  param.value = value;
};

/** One set of tools, in the order they're heard. */
function buildStage(context: BaseAudioContext, chain: Chain | null): Stage {
  const nodes: AudioNode[] = [];
  const keep = <T extends AudioNode>(node: T): T => {
    nodes.push(node);
    return node;
  };
  const gain = (value: number) => {
    const node = keep(context.createGain());
    node.gain.value = value;
    return node;
  };
  /** Moves a value there over a few milliseconds: for a control being moved. */
  const glide: Apply = (param, value) => {
    param.setTargetAtTime(value, context.currentTime, GLIDE);
  };
  const input = gain(1);
  const ducks: Duck[] = [];
  const tuners: Array<(next: Chain) => void> = [];
  let head: AudioNode = input;
  const link = (node: AudioNode) => {
    head.connect(node);
    head = node;
  };

  const stage = (): Stage => ({
    input,
    output: head,
    ducks,
    nodes,
    shape: shapeOf(chain),
    tune(next) {
      if (next) for (const tuner of tuners) tuner(next);
    }
  });

  if (!chain) return stage();

  chain.eq.forEach((band, i) => {
    const filters = filtersFor(context, band).map(keep);
    for (const filter of filters) link(filter);
    tuners.push((next) => tuneFilters(filters, next.eq[i], GLIDE));
  });

  if (chain.saturation) {
    const split = head;
    // Pushed into tanh by the drive, then brought back by it, so a quiet
    // passage comes out as loud as it went in and only the peaks bend.
    const shaper = keep(context.createWaveShaper());
    shaper.curve = tanhCurve(context);
    shaper.oversample = '4x';
    const dry = gain(0);
    const push = gain(0);
    const wet = gain(0);
    const sum = gain(0);
    split.connect(dry).connect(sum);
    split.connect(push).connect(shaper).connect(wet).connect(sum);
    head = sum;
    const set = (next: Chain, apply: Apply) => {
      if (!next.saturation) return;
      const { drive, mix, output } = next.saturation;
      apply(dry.gain, 1 - mix);
      apply(push.gain, dbToGain(drive) / MAX_DRIVE);
      apply(wet.gain, mix / dbToGain(drive));
      apply(sum.gain, dbToGain(output));
    };
    set(chain, place);
    tuners.push((next) => set(next, glide));
  }

  if (chain.sidechain) {
    const duck = gain(1);
    link(duck);
    const entry: Duck = { gain: duck.gain, sidechain: chain.sidechain };
    ducks.push(entry);
    tuners.push((next) => {
      if (next.sidechain) entry.sidechain = next.sidechain;
    });
  }

  if (chain.width) {
    // Mid and side, with the side scaled: left' = ½(1+w)L + ½(1−w)R.
    const splitter = keep(context.createChannelSplitter(2));
    const merger = keep(context.createChannelMerger(2));
    head.connect(splitter);
    const route = (from: 0 | 1, to: 0 | 1) => {
      const node = gain(0);
      splitter.connect(node, from).connect(merger, 0, to);
      return node;
    };
    const same = [route(0, 0), route(1, 1)];
    const cross = [route(1, 0), route(0, 1)];
    head = merger;
    const set = (next: Chain, apply: Apply) => {
      if (!next.width) return;
      const w = next.width.width;
      for (const node of same) apply(node.gain, (1 + w) / 2);
      for (const node of cross) apply(node.gain, (1 - w) / 2);
    };
    set(chain, place);
    tuners.push((next) => set(next, glide));
  }

  if (chain.dynamics) {
    const compressor = keep(context.createDynamicsCompressor());
    link(compressor);
    const makeup = gain(1);
    link(makeup);
    const params = [
      compressor.threshold,
      compressor.ratio,
      compressor.knee,
      compressor.attack,
      compressor.release,
      makeup.gain
    ];
    const set = (next: Chain, apply: Apply) => {
      if (!next.dynamics) return;
      const d = next.dynamics;
      const values = [
        d.threshold,
        d.ratio,
        d.knee,
        d.attack,
        d.release,
        dbToGain(d.makeup)
      ];
      params.forEach((param, i) => apply(param, values[i]));
    };
    set(chain, place);
    tuners.push((next) => set(next, glide));
  }

  return stage();
}

/** A section's tools, faded in over its length and out around it. */
interface Slot {
  section: ChainedSection;
  input: GainNode;
  plain: GainNode;
  tooled: GainNode;
  output: GainNode;
  stage: Stage;
}

/** What has to be scheduled again when it changes: the edges and the ducks. */
function timingOf(sections: readonly ChainedSection[], chain: Chain | null) {
  const ducks = [...sections.map((s) => s.chain), chain].map((c) =>
    c?.sidechain ? Object.values(c.sidechain).join(':') : ''
  );
  return `${sections.map((s) => `${s.at}-${s.end}`).join(',')}/${ducks.join(',')}`;
}

export function createConsultGraph(context: BaseAudioContext): ConsultGraph {
  // Two channels from here on, whatever the file: a mono track would
  // otherwise reach the width's splitter with nothing on its right.
  const input = context.createGain();
  input.channelCount = 2;
  input.channelCountMode = 'explicit';
  input.channelInterpretation = 'speakers';
  const output = context.createGain();
  const plainPath = context.createGain();
  const tooledPath = context.createGain();
  plainPath.gain.value = 0;
  input.connect(plainPath).connect(output);
  tooledPath.connect(output);

  let slots: Slot[] = [];
  let whole: Stage = buildStage(context, null);
  let shape = '';
  let timing = '';
  let element: HTMLMediaElement | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let anchor = { track: 0, audio: 0, rate: 1 };
  let laidUntil = 0;

  const ducks = () => [
    ...slots.flatMap((slot) => slot.stage.ducks),
    ...whole.ducks
  ];

  const audioAt = (track: number) =>
    anchor.audio + (track - anchor.track) / anchor.rate;

  const switchSlot = (slot: Slot, on: boolean, at: number) => {
    slot.tooled.gain.setTargetAtTime(on ? 1 : 0, at, SWITCH);
    slot.plain.gain.setTargetAtTime(on ? 0 : 1, at, SWITCH);
  };

  /** Clear what's scheduled and set everything as it is at the playhead. */
  function reset() {
    const now = context.currentTime;
    const track = element?.currentTime ?? 0;
    anchor = { track, audio: now, rate: element?.playbackRate || 1 };
    laidUntil = track;
    for (const slot of slots) {
      slot.tooled.gain.cancelScheduledValues(now);
      slot.plain.gain.cancelScheduledValues(now);
      switchSlot(slot, covers(slot.section, track), now);
    }
    // A duck already under way comes back up at its own pace, not with a jump.
    for (const duck of ducks()) {
      duck.gain.cancelScheduledValues(now);
      duck.gain.setTargetAtTime(1, now, duckRecovery(duck.sidechain));
    }
    lay();
  }

  /** Schedule what falls between what's laid already and the horizon. */
  function lay() {
    if (!element || element.paused || element.ended) return;
    const track = element.currentTime;
    if (Math.abs(audioAt(track) - context.currentTime) > DRIFT) {
      reset();
      return;
    }
    const until = track + HORIZON;
    if (until <= laidUntil) return;
    const now = context.currentTime;
    for (const slot of slots)
      for (const edge of edgesBetween(slot.section, laidUntil, until))
        switchSlot(slot, edge.on, Math.max(now, audioAt(edge.time)));
    for (const duck of ducks())
      for (const time of duckTimes(duck.sidechain, laidUntil, until)) {
        const at = audioAt(time);
        if (at < now) continue;
        duck.gain.setTargetAtTime(
          duckFloor(duck.sidechain),
          at,
          DUCK_ATTACK / 3
        );
        duck.gain.setTargetAtTime(
          1,
          at + DUCK_ATTACK,
          duckRecovery(duck.sidechain)
        );
      }
    laidUntil = until;
  }

  function teardown() {
    for (const slot of slots) {
      for (const node of [slot.input, slot.plain, slot.tooled, slot.output])
        node.disconnect();
      for (const node of slot.stage.nodes) node.disconnect();
    }
    for (const node of whole.nodes) node.disconnect();
    input.disconnect();
    input.connect(plainPath);
    slots = [];
  }

  function rebuild(sections: ChainedSection[], chain: Chain | null) {
    teardown();
    slots = sections.map((section) => {
      const slot: Slot = {
        section,
        input: context.createGain(),
        plain: context.createGain(),
        tooled: context.createGain(),
        output: context.createGain(),
        stage: buildStage(context, section.chain)
      };
      slot.tooled.gain.value = 0;
      slot.input.connect(slot.plain).connect(slot.output);
      slot.input.connect(slot.stage.input);
      slot.stage.output.connect(slot.tooled).connect(slot.output);
      return slot;
    });
    whole = buildStage(context, chain);

    let head: AudioNode = input;
    for (const slot of slots) {
      head.connect(slot.input);
      head = slot.output;
    }
    head.connect(whole.input);
    whole.output.connect(tooledPath);
  }

  function set(tools: Tools | null) {
    const sections = tools ? chainedSections(tools.notes) : [];
    const chain = tools?.chain ?? null;
    const nextShape = [
      ...sections.map((s) => `${s.id}:${shapeOf(s.chain)}`),
      shapeOf(chain)
    ].join('/');
    const nextTiming = timingOf(sections, chain);

    if (nextShape === shape) {
      slots.forEach((slot, i) => {
        slot.section = sections[i];
        slot.stage.tune(sections[i].chain);
      });
      whole.tune(chain);
    } else {
      rebuild(sections, chain);
    }
    const retime = nextShape !== shape || nextTiming !== timing;
    shape = nextShape;
    timing = nextTiming;
    if (retime) reset();
  }

  function bypass(on: boolean) {
    const now = context.currentTime;
    plainPath.gain.setTargetAtTime(on ? 1 : 0, now, SWITCH * 2);
    tooledPath.gain.setTargetAtTime(on ? 0 : 1, now, SWITCH * 2);
  }

  const EVENTS = ['play', 'playing', 'pause', 'seeked', 'ratechange', 'ended'];

  function follow(media: HTMLMediaElement) {
    stop();
    element = media;
    for (const event of EVENTS) media.addEventListener(event, reset);
    timer = setInterval(lay, TICK_MS);
    reset();
    return stop;
  }

  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (element)
      for (const event of EVENTS) element.removeEventListener(event, reset);
    element = null;
  }

  set(null);

  return {
    input,
    output,
    set,
    bypass,
    follow,
    dispose() {
      stop();
      teardown();
      input.disconnect();
      plainPath.disconnect();
      tooledPath.disconnect();
      output.disconnect();
    }
  };
}
