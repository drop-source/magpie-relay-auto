// magpie provider plugin: any OpenAI-compatible relay with auto-filled context limits.
// Configure per relay via `magpie plugin options <plugin> '{"id":"myrelay","name":"My Relay","api":"https://host/v1"}'`.
// Pulls /v1/models (no login/auth), strips relay prefixes like [free]/[ant]/[次],
// and fills in context/output limits from models.dev by standard model name.

const MODELS_DEV = "https://models.dev/api.json"

// defaults: a placeholder relay; override everything with plugin options.
// Override everything with plugin options; only `id` and `api` are required.
// All matching rules are configurable so new relay formats need no code change:
//   prefixes:  regex sources stripped from the start of a model id
//   suffixes:  regex sources stripped from the end of a model id
//   aliases:   { "relay-model-id": "models.dev-model-id" } exact overrides
//   freeTag:   prefix regex marking a model as free (default [free])
const DEFAULTS = {
  id: "myrelay",
  name: "My Relay",
  api: "https://example.com/v1",
  prefixes: ["free", "ant", "次", "pro", "plus", "test", "beta", "stable", "限时"],
  suffixes: ["thinking", "latest", "preview", "\\d{4}-\\d{2}(-\\d{2})?"],
  aliases: {},
  freeTag: "free",
}

// build one combined regex from a list of alternatives, e.g. ["free","ant"] -> /^\[(free|ant)\]/i
function tagRegex(list) {
  if (!Array.isArray(list) || list.length === 0) return null
  return new RegExp(`^\\[(${list.map((s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\]`, "i")
}
function suffixRegex(list) {
  if (!Array.isArray(list) || list.length === 0) return null
  return new RegExp(`-(${list.join("|")})$`, "i")
}

// fetch models.dev once, cache for the host process lifetime
let modelsDevCache = null
async function getModelsDev() {
  if (modelsDevCache) return modelsDevCache
  try {
    const res = await fetch(MODELS_DEV)
    if (res.ok) {
      modelsDevCache = await res.json()
      return modelsDevCache
    }
  } catch {}
  modelsDevCache = {}
  return modelsDevCache
}

// find a model entry in models.dev by bare name, searching all providers
function findInModelsDev(db, name, aliases, suffixes) {
  if (!name || !db) return null
  // exact alias override first: {"relay-id": "models.dev-id"}
  const aliased = aliases?.[name] ?? name
  for (const prov of Object.values(db)) {
    const models = prov?.models
    if (!models) continue
    // exact id match
    if (models[aliased]) return models[aliased]
    // match ignoring version suffixes like -2026-09, -latest
    if (suffixes) {
      const stripped = aliased.replace(suffixes, "")
      if (stripped !== aliased && models[stripped]) return models[stripped]
    }
  }
  return null
}

export const RelayAutoPlugin = async ({ client, options = {} }) => {
  const cfg = { ...DEFAULTS, ...options }
  const PROVIDER = cfg.id
  const BASE = String(cfg.api).replace(/\/+$/, "")
  if (!PROVIDER || !BASE) throw new Error("relay plugin needs options: { id, api }")
  const PREFIXES = tagRegex(cfg.prefixes)
  const SUFFIXES = suffixRegex(cfg.suffixes)
  const ALIASES = cfg.aliases && typeof cfg.aliases === "object" ? cfg.aliases : {}
  const FREE_TAG = tagRegex([cfg.freeTag].flat())

  return {
    config: async (c) => {
      c.provider ??= {}
      c.provider[PROVIDER] ??= {
        name: cfg.name ?? PROVIDER,
        npm: "@ai-sdk/openai-compatible",
        api: BASE,
        models: {},
      }
    },

    provider: {
      id: PROVIDER,
      async models(provider) {
        const res = await fetch(`${BASE}/models`)
        if (!res.ok) return provider.models // keep the old list on failure
        const { data } = await res.json()
        if (!Array.isArray(data)) return provider.models

        const db = await getModelsDev()
        const out = {}
        for (const m of data) {
          const id = m.id ?? m
          if (typeof id !== "string") continue
          const bare = PREFIXES ? id.replace(PREFIXES, "") : id
          const known = findInModelsDev(db, bare, ALIASES, SUFFIXES)
          const entry = {
            id,
            name: m.name ?? bare,
            tool_call: true,
          }
          if (known) {
            if (known.limit?.context) entry.limit = { context: known.limit.context, output: known.limit.output }
            if (known.reasoning) entry.reasoning = true
            if (known.cost) {
              entry.cost = {
                input: known.cost.input,
                output: known.cost.output,
                cache_read: known.cost.cache_read,
                cache_write: known.cost.cache_write,
              }
            }
          }
          // relay free tier: mark as free so it doesn't count against quota
          if (FREE_TAG && FREE_TAG.test(id)) entry.free = true
          out[id] = entry
        }
        return out
      },
    },
  }
}

export default RelayAutoPlugin
export const _internal = { findInModelsDev, getModelsDev, tagRegex, suffixRegex }
