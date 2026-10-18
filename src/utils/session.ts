import type { SessionState } from '../types';

export type SessionAction =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'reset' };

export const initialSession: SessionState = {
  status: 'idle',
  startedAt: null,
  accumulatedMs: 0,
  resumedAt: null,
};

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'start':
      if (state.status !== 'idle') return state;
      return { status: 'running', startedAt: action.now, accumulatedMs: 0, resumedAt: action.now };
    case 'pause':
      if (state.status !== 'running' || state.resumedAt === null) return state;
      return {
        ...state,
        status: 'paused',
        accumulatedMs: state.accumulatedMs + Math.max(0, action.now - state.resumedAt),
        resumedAt: null,
      };
    case 'resume':
      if (state.status !== 'paused') return state;
      return { ...state, status: 'running', resumedAt: action.now };
    case 'reset':
      return initialSession;
  }
}

/** Active (non-paused) reading time in ms. */
export function getActiveMs(state: SessionState, now: number): number {
  if (state.status === 'running' && state.resumedAt !== null) {
    return state.accumulatedMs + Math.max(0, now - state.resumedAt);
  }
  return state.accumulatedMs;
}
