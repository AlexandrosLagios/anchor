import { Logger } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Family, State, Store } from './types';

// ponytail: each save rewrites the whole record; move to SQLite when a save gets slow or a second process writes
export function openStore(file: string, realNow = Date.now()): Store {
  const state = load(file) ?? { clockStart: realNow, families: [] };
  const store: Store = {
    state,
    family: (id) => state.families.find((family) => family.id === id),
    addFamily(id, chatId) {
      const family: Family = { id, chatId, storytellers: [], moments: [], counters: {} };
      state.families.push(family);
      return family;
    },
    familyOfStoryteller: (userId) =>
      state.families.find((family) => family.storytellers.some((person) => person.id === userId)),
    save() {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(`${file}.tmp`, JSON.stringify(state));
      renameSync(`${file}.tmp`, file);
    },
  };
  if (!existsSync(file)) store.save();
  return store;
}

function load(file: string): State | undefined {
  if (!existsSync(file)) return undefined;
  const text = readFileSync(file, 'utf8');
  try {
    const state = JSON.parse(text) as State;
    if (typeof state.clockStart === 'number' && Array.isArray(state.families)) return state;
    throw new Error('not a State');
  } catch (error) {
    const aside = `${file}.corrupt-${Date.now()}`;
    renameSync(file, aside);
    new Logger('Store').warn(`${file} is unreadable (${error}), moved it to ${aside} and started empty`);
    return undefined;
  }
}
