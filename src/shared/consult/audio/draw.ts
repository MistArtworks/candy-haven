import { EQ_BAND_READS, type EqBand, type Note } from '../engine/params';
import { byteToSample, byteToUnit, WAVEFORM_STRIDE } from '../engine/peaks';
import {
  EQ_GRID_HZ,
  EQ_VIEW_DB,
  frequencyForX,
  xForFrequency,
  yForGain
} from '../engine/scale';

// What the page and Candy Haven draw, onto a canvas each sized and scaled
// by its caller: the waveform with the notes on it, the spectrum, and the
// EQ's grid, curve and points. Colours are the caller's, so each draws in
// its own palette; the shapes are the same on both.

export type Rgb = readonly [number, number, number];

const rgba = ([r, g, b]: Rgb, alpha: number) =>
  `rgba(${r}, ${g}, ${b}, ${alpha})`;

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t)
];

// ----------------------------------------------------------------- waveform

export interface WaveformPalette {
  /** Where the low end carries the column. */
  low: Rgb;
  /** Where the top end does. */
  high: Rgb;
  /** Alpha for what's still to play, and for what has. */
  rest: number;
  played: number;
  section: string;
  sectionActive: string;
  pin: string;
  pinActive: string;
  /** A section being marked out, before it's a note. */
  marking: string;
  playhead: string;
}

export interface WaveformScene {
  /** The compact waveform (peaks.ts). */
  data: Uint8Array;
  /** The track's length, in seconds. */
  duration: number;
  /** The playhead, in seconds. */
  position: number;
  notes: ReadonlyArray<Pick<Note, 'id' | 'at' | 'end'>>;
  /** The note picked out, if any. */
  active?: string | null;
  /** A section being marked out. */
  marking?: { from: number; to: number } | null;
}

/** Tone steps the columns are coloured in, so each colour is one fill. */
const TONE_STEPS = 12;

export function drawWaveform(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: WaveformScene,
  palette: WaveformPalette
) {
  context.clearRect(0, 0, width, height);
  const { data, duration } = scene;
  const xAt = (seconds: number) =>
    duration > 0
      ? (Math.min(Math.max(seconds, 0), duration) / duration) * width
      : 0;

  // Sections first, behind the waveform.
  for (const note of scene.notes) {
    if (note.end === null) continue;
    context.fillStyle =
      note.id === scene.active ? palette.sectionActive : palette.section;
    context.fillRect(
      xAt(note.at),
      0,
      Math.max(1, xAt(note.end) - xAt(note.at)),
      height
    );
  }
  if (scene.marking) {
    const from = Math.min(scene.marking.from, scene.marking.to);
    const to = Math.max(scene.marking.from, scene.marking.to);
    context.fillStyle = palette.marking;
    context.fillRect(xAt(from), 0, Math.max(1, xAt(to) - xAt(from)), height);
  }

  // The waveform: one path per colour, filled once each.
  const columns = Math.floor(data.length / WAVEFORM_STRIDE);
  const middle = height / 2;
  const playedX = xAt(scene.position);
  const paths = new Map<string, Path2D>();
  if (columns > 0) {
    for (let x = 0; x < width; x++) {
      const from = Math.floor((x / width) * columns);
      const to = Math.max(from + 1, Math.floor(((x + 1) / width) * columns));
      let low = 1;
      let high = -1;
      let tone = 0;
      for (let column = from; column < to && column < columns; column++) {
        low = Math.min(low, byteToSample(data[column * WAVEFORM_STRIDE]));
        high = Math.max(high, byteToSample(data[column * WAVEFORM_STRIDE + 1]));
        tone += byteToUnit(data[column * WAVEFORM_STRIDE + 2]);
      }
      if (high < low) continue;
      const step = Math.round((tone / (to - from)) * TONE_STEPS);
      const key = `${step}:${x < playedX ? 1 : 0}`;
      let path = paths.get(key);
      if (!path) {
        path = new Path2D();
        paths.set(key, path);
      }
      const top = middle - high * middle * 0.92;
      const bottom = middle - low * middle * 0.92;
      path.rect(x, top, 1, Math.max(1, bottom - top));
    }
  }
  for (const [key, path] of paths) {
    const [step, played] = key.split(':').map(Number);
    context.fillStyle = rgba(
      mix(palette.low, palette.high, step / TONE_STEPS),
      played ? palette.played : palette.rest
    );
    context.fill(path);
  }

  // Moments as pins, the picked one brighter.
  for (const note of scene.notes) {
    if (note.end !== null) continue;
    const x = Math.round(xAt(note.at)) + 0.5;
    const active = note.id === scene.active;
    context.strokeStyle = active ? palette.pinActive : palette.pin;
    context.fillStyle = context.strokeStyle;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, 6);
    context.lineTo(x, height);
    context.stroke();
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + 4, 4);
    context.lineTo(x, 8);
    context.lineTo(x - 4, 4);
    context.closePath();
    context.fill();
  }

  context.fillStyle = palette.playhead;
  context.fillRect(Math.round(playedX), 0, 1, height);
}

// ----------------------------------------------------------------- spectrum

export interface SpectrumPalette {
  fill: string;
  line: string;
}

/**
 * An analyser's reading, across the EQ's own frequency axis, so the curve
 * drawn over it lines up with what's sounding.
 */
export function drawSpectrum(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  bins: Uint8Array,
  sampleRate: number,
  palette: SpectrumPalette
) {
  if (bins.length === 0) return;
  const nyquist = sampleRate / 2;
  const path = new Path2D();
  path.moveTo(0, height);
  for (let x = 0; x <= width; x += 2) {
    const hz = frequencyForX(x, width);
    const bin = Math.min(
      bins.length - 1,
      Math.round((hz / nyquist) * bins.length)
    );
    path.lineTo(x, height - (bins[bin] / 255) * height);
  }
  path.lineTo(width, height);
  path.closePath();
  context.fillStyle = palette.fill;
  context.fill(path);
  context.strokeStyle = palette.line;
  context.lineWidth = 1;
  context.stroke(path);
}

// ---------------------------------------------------------------------- EQ

export interface EqPalette {
  grid: string;
  label: string;
  /** The labels' font, as a canvas font string. */
  font: string;
  curve: string;
  /** Under the curve, toward the 0 dB line. */
  area: string;
  point: string;
  pointActive: string;
}

const gridLabel = (hz: number) => (hz < 1000 ? `${hz}` : `${hz / 1000}k`);

export function drawEqGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: EqPalette
) {
  context.strokeStyle = palette.grid;
  context.lineWidth = 1;
  context.fillStyle = palette.label;
  context.font = palette.font;
  context.textBaseline = 'bottom';
  for (const hz of EQ_GRID_HZ) {
    const x = Math.round(xForFrequency(hz, width)) + 0.5;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.fillText(gridLabel(hz), x + 3, height - 3);
  }
  context.textBaseline = 'middle';
  for (const db of [12, 6, 0, -6, -12]) {
    const y = Math.round(yForGain(db, height)) + 0.5;
    context.globalAlpha = db === 0 ? 1 : 0.5;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
    context.globalAlpha = 1;
    if (db !== 0) context.fillText(`${db > 0 ? '+' : ''}${db}`, 3, y - 6);
  }
}

/** The combined curve, filled toward 0 dB. */
export function drawEqCurve(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  response: Float32Array,
  palette: EqPalette
) {
  if (response.length < 2) return;
  const zero = yForGain(0, height);
  const line = new Path2D();
  for (let i = 0; i < response.length; i++) {
    const x = (i / (response.length - 1)) * width;
    const y = yForGain(response[i], height, EQ_VIEW_DB);
    if (i === 0) line.moveTo(x, y);
    else line.lineTo(x, y);
  }
  const area = new Path2D(line);
  area.lineTo(width, zero);
  area.lineTo(0, zero);
  area.closePath();
  context.fillStyle = palette.area;
  context.fill(area);
  context.strokeStyle = palette.curve;
  context.lineWidth = 1.5;
  context.stroke(line);
}

/** Where a point sits in the picture: its frequency, and its gain if it has one. */
export function pointAt(band: EqBand, width: number, height: number) {
  return {
    x: xForFrequency(band.frequency, width),
    y: yForGain(EQ_BAND_READS[band.type].gain ? band.gain : 0, height)
  };
}

/** A point's radius, and how near the pointer must come to take it. */
export const POINT_RADIUS = 5;
export const POINT_REACH = 12;

export function drawEqPoints(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  bands: readonly EqBand[],
  active: string | null,
  palette: EqPalette
) {
  for (const band of bands) {
    const { x, y } = pointAt(band, width, height);
    const on = band.id === active;
    context.beginPath();
    context.arc(x, y, on ? POINT_RADIUS + 1.5 : POINT_RADIUS, 0, Math.PI * 2);
    context.fillStyle = on ? palette.pointActive : palette.point;
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = palette.curve;
    context.stroke();
  }
}
