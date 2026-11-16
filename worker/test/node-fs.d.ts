declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
  /** No encoding: Node returns a Buffer, which is a Uint8Array of the file bytes. */
  export function readFileSync(path: string | URL): Uint8Array;
}

interface ImportMeta {
  readonly url: string;
}
