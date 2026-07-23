import * as Crypto from 'expo-crypto';
import { DieFace } from './types';

const UINT32_RANGE = 0x1_0000_0000;
const D6_ACCEPT_LIMIT = Math.floor(UINT32_RANGE / 6) * 6;

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function splitMix32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x9e3779b9) >>> 0;
    let z = value;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

/** xoshiro128**: fast deterministic 32-bit stream with a 128-bit state. */
export class SeededRng {
  private state: [number, number, number, number];

  constructor(seed: string, domain = 'outcome') {
    const expand = splitMix32(fnv1a(`${domain}:${seed}`));
    this.state = [expand(), expand(), expand(), expand()];
    if (this.state.every((part) => part === 0)) this.state[0] = 1;
  }

  nextUint32(): number {
    const s = this.state;
    const result = Math.imul(((Math.imul(s[1], 5) << 7) | (Math.imul(s[1], 5) >>> 25)) >>> 0, 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = ((s[3] << 11) | (s[3] >>> 21)) >>> 0;
    return result;
  }

  nextFloat(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  die(): DieFace {
    let sample = this.nextUint32();
    while (sample >= D6_ACCEPT_LIMIT) sample = this.nextUint32();
    return ((sample % 6) + 1) as DieFace;
  }

  dice(): [DieFace, DieFace] {
    return [this.die(), this.die()];
  }
}

export function createManualSeed(): string {
  try {
    const bytes = Crypto.getRandomBytes(16);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }
}

export function deriveSeed(seed: string, ...parts: Array<string | number>): string {
  return `${seed}:${parts.join(':')}`;
}
