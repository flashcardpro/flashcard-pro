import { getLib } from './store';

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  return window.speechSynthesis.getVoices();
}

export function onVoicesChanged(fn: () => void): () => void {
  if (!ttsSupported()) return () => {};
  window.speechSynthesis.addEventListener('voiceschanged', fn);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', fn);
}

const DEVANAGARI = /[ऀ-ॿ]/;

export function guessLang(text: string): string {
  return DEVANAGARI.test(text) ? 'hi-IN' : 'en-IN';
}

export function speak(text: string, lang = '') {
  if (!ttsSupported() || !text.trim()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const settings = getLib().settings;
  const wanted = lang || guessLang(text);
  const voices = synth.getVoices();
  const chosen =
    (settings.ttsVoice && !lang && !DEVANAGARI.test(text) ? voices.find((v) => v.voiceURI === settings.ttsVoice) : undefined) ||
    voices.find((v) => v.lang === wanted) ||
    voices.find((v) => v.lang.startsWith(wanted.slice(0, 2)));
  if (chosen) u.voice = chosen;
  u.lang = chosen?.lang || wanted;
  u.rate = settings.ttsRate || 1;
  synth.speak(u);
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
