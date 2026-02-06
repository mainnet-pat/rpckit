export type SchemaEntry = { method: string; params: unknown[]; return: unknown }

export type Schema = { requests: SchemaEntry[]; subscriptions: SchemaEntry[] }

// Default schema for untyped usage
export type AnySchema = {
  requests: [{ method: string; params: unknown[]; return: unknown }]
  subscriptions: [{ method: string; params: unknown[]; return: unknown }]
}

type AllEntries<S extends Schema> = [...S['requests'], ...S['subscriptions']]

export type ExtractMethod<S extends Schema> = AllEntries<S>[number]['method']

export type ExtractRequestMethod<S extends Schema> =
  S['requests'][number]['method']

export type ExtractSubscriptionMethod<S extends Schema> =
  S['subscriptions'][number]['method']

export type ExtractEntry<S extends Schema, M extends string> = Extract<
  AllEntries<S>[number],
  { method: M }
>

// Fallback to unknown when entry not found (for AnySchema compatibility)
export type ExtractReturn<S extends Schema, M extends string> = ExtractEntry<
  S,
  M
> extends never
  ? unknown
  : ExtractEntry<S, M>['return']

export type ExtractParams<S extends Schema, M extends string> = ExtractEntry<
  S,
  M
> extends never
  ? unknown[]
  : ExtractEntry<S, M>['params']
