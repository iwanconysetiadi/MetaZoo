import { ChallengeDefinition, CustomObjectiveDefinition } from './ChallengeObjective';
import { SculptWorldDefinition } from '../sculpt/SculptObjective';
import { newId } from './factory';

const FUNC_KEY = 'metazoo.customFunctions.v1';
const CHAL_KEY = 'metazoo.challenges.v1';
const SCULPT_KEY = 'metazoo.sculpts.v1';

export interface SavedCustomFunction {
  id: string;
  name: string;
  definition: CustomObjectiveDefinition;
}

function read<T>(key: string): T[] {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — silently keep in-memory only */
  }
}

// -- custom functions ---------------------------------------------------
export function listCustomFunctions(): SavedCustomFunction[] {
  return read<SavedCustomFunction>(FUNC_KEY);
}

export function saveCustomFunction(definition: CustomObjectiveDefinition, existingId?: string): SavedCustomFunction {
  const items = listCustomFunctions();
  const id = existingId ?? newId('fn');
  const entry: SavedCustomFunction = { id, name: definition.name, definition };
  const idx = items.findIndex(f => f.id === id);
  if (idx >= 0) items[idx] = entry;
  else items.push(entry);
  write(FUNC_KEY, items);
  return entry;
}

export function deleteCustomFunction(id: string): void {
  write(FUNC_KEY, listCustomFunctions().filter(f => f.id !== id));
}

// -- challenges ---------------------------------------------------------
export function listChallenges(): ChallengeDefinition[] {
  return read<ChallengeDefinition>(CHAL_KEY);
}

export function saveChallenge(challenge: ChallengeDefinition): void {
  const items = listChallenges();
  const idx = items.findIndex(c => c.id === challenge.id);
  if (idx >= 0) items[idx] = challenge;
  else items.push(challenge);
  write(CHAL_KEY, items);
}

export function deleteChallenge(id: string): void {
  write(CHAL_KEY, listChallenges().filter(c => c.id !== id));
}

// -- sculpt worlds ------------------------------------------------------
export function listSculptWorlds(): SculptWorldDefinition[] {
  return read<SculptWorldDefinition>(SCULPT_KEY);
}

export function saveSculptWorld(def: SculptWorldDefinition): void {
  const items = listSculptWorlds();
  const idx = items.findIndex(s => s.id === def.id);
  if (idx >= 0) items[idx] = def;
  else items.push(def);
  write(SCULPT_KEY, items);
}

export function deleteSculptWorld(id: string): void {
  write(SCULPT_KEY, listSculptWorlds().filter(s => s.id !== id));
}
