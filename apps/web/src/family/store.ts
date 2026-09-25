import { useCallback, useEffect, useState } from 'react';
import { createInitialState } from './data';
import type { AuditEntry, FamilyState } from './types';

const KEY = 'anchor_family_space_v1';

function cloneInitial(): FamilyState {
  return createInitialState();
}

export function loadFamilyState(): FamilyState {
  if (typeof window === 'undefined') return cloneInitial();
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return cloneInitial();
    return JSON.parse(raw) as FamilyState;
  } catch {
    return cloneInitial();
  }
}

export function saveFamilyState(state: FamilyState) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, JSON.stringify(state));
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function withAudit(state: FamilyState, text: string): FamilyState {
  const entry: AuditEntry = {
    id: `a-${Date.now()}`,
    date: todayStamp(),
    text,
  };
  return { ...state, audit: [entry, ...state.audit] };
}

export function useFamilyState() {
  const [state, setState] = useState<FamilyState>(cloneInitial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(loadFamilyState());
    setReady(true);
  }, []);

  const update = useCallback((recipe: (current: FamilyState) => FamilyState) => {
    setState((current) => {
      const next = recipe(current);
      saveFamilyState(next);
      return next;
    });
  }, []);

  return { state, ready, update };
}
