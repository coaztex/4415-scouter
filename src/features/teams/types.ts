export type AwaitedReturn<T> = T extends (...args: never[]) => Promise<infer R>
  ? R
  : never;
