import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { openStore } from './store';

const stateFile = () => join(mkdtempSync(join(tmpdir(), 'anchor-store-')), 'state.json');

test('the first boot sets clockStart once, and a restart keeps it', () => {
  const file = stateFile();
  expect(openStore(file, 1000).state).toEqual({ clockStart: 1000, families: [] });
  expect(openStore(file, 5000).state.clockStart).toBe(1000);
});

test('a saved family survives a restart', () => {
  const file = stateFile();
  const store = openStore(file, 1000);
  const family = store.addFamily('-100', '-100');
  family.storytellers.push({ id: '42', name: 'Nikos', started: true });
  family.counters.rules = 2;
  store.save();

  const reopened = openStore(file, 5000);
  expect(reopened.family('-100')).toEqual({
    id: '-100',
    chatId: '-100',
    storytellers: [{ id: '42', name: 'Nikos', started: true }],
    moments: [],
    counters: { rules: 2 },
  });
  expect(reopened.familyOfStoryteller('42')?.id).toBe('-100');
  expect(reopened.familyOfStoryteller('7')).toBeUndefined();
  expect(reopened.family('-200')).toBeUndefined();
});

test('a file that does not parse moves aside and the store starts empty', () => {
  const file = stateFile();
  writeFileSync(file, '{"clockStart": 1000, "fami');

  expect(openStore(file, 5000).state).toEqual({ clockStart: 5000, families: [] });
  const corrupt = readdirSync(join(file, '..')).filter((name) => name.startsWith('state.json.corrupt-'));
  expect(corrupt).toHaveLength(1);
  expect(readFileSync(join(file, '..', corrupt[0]), 'utf8')).toBe('{"clockStart": 1000, "fami');
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ clockStart: 5000, families: [] });
});

test('a state file that cannot be read stays where it is, and the store throws', () => {
  const file = stateFile();
  mkdirSync(file);
  expect(() => openStore(file, 5000)).toThrow(/EISDIR/);
  expect(statSync(file).isDirectory()).toBe(true);
  expect(readdirSync(join(file, '..'))).toEqual(['state.json']);
});

test('a file with the wrong shape counts as corrupt', () => {
  const file = stateFile();
  writeFileSync(file, 'null');
  expect(openStore(file, 5000).state).toEqual({ clockStart: 5000, families: [] });
  expect(existsSync(file)).toBe(true);
});
