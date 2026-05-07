declare module 'pg-format' {
  export default function format(template: string, ...args: ReadonlyArray<unknown>): string;
}
