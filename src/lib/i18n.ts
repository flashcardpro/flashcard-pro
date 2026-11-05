import { useStore } from './store';
import { HI } from './i18n-hi';
import type { Language } from './types';

export type T = (text: string, vars?: Record<string, string | number>) => string;

function interpolate(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function translate(lang: Language, text: string, vars?: Record<string, string | number>): string {
  const base = lang === 'hi' ? HI[text] ?? text : text;
  return interpolate(base, vars);
}

export function useT(): T {
  const lang = useStore((s) => s.lib.settings.language);
  return (text, vars) => translate(lang, text, vars);
}

export function useLang(): Language {
  return useStore((s) => s.lib.settings.language);
}

export function tNow(text: string, vars?: Record<string, string | number>) {
  return translate(useStore.getState().lib.settings.language, text, vars);
}

export function plural(t: T, n: number, one: string, many: string) {
  return t(n === 1 ? one : many, { n });
}
