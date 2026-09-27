import { DEFAULT_PUBLIC_MODEL_ID, MODEL_OBJECT } from "./constants";

const MODEL_ALIASES = new Map([
  [DEFAULT_PUBLIC_MODEL_ID, "asr-1.0"],
  ["asr-1.0", "asr-1.0"],
]);

export function resolveModel(model: string): string | undefined {
  return MODEL_ALIASES.get(model);
}

export function isAllowedModel(model: string): boolean {
  return MODEL_ALIASES.has(model);
}

export function modelList() {
  return {
    object: "list",
    data: [...MODEL_ALIASES.keys()].map((id) => ({
      id,
      object: MODEL_OBJECT,
      created: 0,
      owned_by: "minimax",
    })),
  };
}

export function modelObject(id: string) {
  return {
    id,
    object: MODEL_OBJECT,
    created: 0,
    owned_by: "minimax",
  };
}
