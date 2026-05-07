export class DeterministicRandom {
  private state: number;

  constructor(seed: string) {
    this.state = hashSeed(seed) || 1;
  }

  next(): number {
    let x = this.state >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0xffffffff;
  }

  int(min: number, max: number): number {
    if (max <= min) {
      return min;
    }

    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(values: readonly T[]): T {
    return values[this.int(0, values.length - 1)];
  }
}

const hashSeed = (seed: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

export const titleCase = (value: string): string =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

export const toSafaricomPhone = (numericSeed: number): string => {
  const prefixes = ['0700', '0701', '0702', '0703', '0710', '0711', '0712', '0713', '0720', '0721', '0722', '0728', '0790', '0791', '0110', '0111', '0112', '0113', '0114', '0115'];
  const prefix = prefixes[Math.abs(numericSeed) % prefixes.length];
  const suffix = String(100000 + (Math.abs(numericSeed * 7919) % 900000)).padStart(6, '0');
  return `${prefix}${suffix}`;
};

export const toEmail = (localPart: string, tenant: string): string => {
  const normalizedLocal = localPart
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return `${normalizedLocal}@${tenant}.demo.shulehub.ke`;
};

export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
