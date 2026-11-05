import { create } from 'zustand';

/** The tab the user was on when they opened Ask, so suggestions fit the screen. */
export type AskContext = 'index' | 'workouts' | 'progress' | 'profile';

export const useAiEntry = create<{ from: AskContext; setFrom: (from: AskContext) => void }>((set) => ({
  from: 'index',
  setFrom: (from) => set({ from }),
}));

export function isAskContext(name: string): name is AskContext {
  return name === 'index' || name === 'workouts' || name === 'progress' || name === 'profile';
}
