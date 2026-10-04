import { strFromU8, strToU8 } from 'fflate';
import { decodeWorkbookXml } from '@/lib/cdm-export/xml-utf8';

type Decode = (bytes: Uint8Array) => string;

function withoutNativeDecoder(check: (decode: Decode, original: Decode) => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'TextDecoder');
  Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, value: undefined });
  try {
    jest.isolateModules(() => {
      // fflate chooses its decoder when loaded, so isolate both modules together.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fallback = require('@/lib/cdm-export/xml-utf8') as { decodeWorkbookXml: Decode };
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const original = require('fflate') as { strFromU8: Decode };
      check(fallback.decodeWorkbookXml, original.strFromU8);
    });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'TextDecoder', descriptor);
    else Reflect.deleteProperty(globalThis, 'TextDecoder');
  }
}

function outcome(decode: Decode, bytes: Uint8Array): unknown {
  try {
    return { value: decode(bytes) };
  } catch (error) {
    const failure = error as Error & { code?: number };
    return { error: failure.message, code: failure.code };
  }
}

describe('decodeWorkbookXml', () => {
  it.each(['', '<worksheet>ASCII</worksheet>', '\uFEFF日本語😀\uFEFF'])('keeps native decoding for %p', (text) => {
    const bytes = strToU8(text);
    expect(decodeWorkbookXml(bytes)).toBe(strFromU8(bytes));
  });

  it('preserves fallback text and BOMs across chunk boundaries', () => {
    const texts = ['', '\uFEFF' + 'x'.repeat(1019) + '\uFEFF日本語😀', '<worksheet>' + '日本語😀'.repeat(6000)];
    const inputs = texts.map((text) => strToU8(text));
    withoutNativeDecoder((decode, original) => {
      for (const bytes of inputs) expect(decode(bytes)).toBe(original(bytes));
    });
  });

  it('carries split two-, three- and four-byte characters between chunks', () => {
    const inputs = ['é', '日', '😀'].flatMap((character) =>
      [1021, 1022, 1023, 1024, 4095].map((offset) => strToU8('x'.repeat(offset) + character + 'suffix')),
    );
    withoutNativeDecoder((decode, original) => {
      for (const bytes of inputs) expect(decode(bytes)).toBe(original(bytes));
    });
  });

  it('preserves fflate fallback results and errors for malformed or truncated input', () => {
    const tails = [[0xc3], [0xe6, 0x97], [0xf0, 0x9f, 0x98], [0x80], [0xff], [0xc3, 0x41], [0xed, 0xa0, 0x80]];
    const inputs = tails.flatMap((tail) =>
      [0, 1023, 1024, 4095, 4096].map((offset) => new Uint8Array([...new Uint8Array(offset).fill(120), ...tail])),
    );
    withoutNativeDecoder((decode, original) => {
      for (const bytes of inputs) expect(outcome(decode, bytes)).toEqual(outcome(original, bytes));
    });
  });
});
