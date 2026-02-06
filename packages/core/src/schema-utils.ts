/** Filter out entries with a specific method from a tuple */
export type FilterMethod<
  T extends readonly unknown[],
  M extends string,
> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends { method: M }
    ? FilterMethod<Tail, M>
    : [Head, ...FilterMethod<Tail, M>]
  : []

/** Filter out multiple methods from a tuple */
export type FilterMethods<
  T extends readonly unknown[],
  Entries extends readonly { method: string }[],
> = Entries extends readonly [
  infer E extends { method: string },
  ...infer Rest extends { method: string }[],
]
  ? FilterMethods<FilterMethod<T, E['method']>, Rest>
  : T

/** Override request methods in a schema */
export type OverrideRequests<
  S extends { requests: readonly unknown[]; subscriptions: readonly unknown[] },
  NewEntries extends readonly {
    method: string
    params: unknown[]
    return: unknown
  }[],
> = {
  requests: [...FilterMethods<S['requests'], NewEntries>, ...NewEntries]
  subscriptions: S['subscriptions']
}
