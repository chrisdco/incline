import { useEffect, useRef, useState } from 'react';

/**
 * Hold-to-talk for Ask (ASK-UI.md "Voice"). The platform recogniser
 * (iOS SFSpeechRecognizer, Android SpeechRecognizer) through
 * expo-speech-recognition, on-device where the phone supports it so audio
 * stays local. Text only leaves the phone when the user sends it, like typing.
 *
 * Loaded lazily: builds without the native module get `available: false`
 * and the composer shows no mic (never a dead button).
 */
type SpeechModule = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;

let cached: SpeechModule | null | undefined;
function speech(): SpeechModule | null {
  if (cached === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: the native module may be absent
      cached = (require('expo-speech-recognition') as { ExpoSpeechRecognitionModule: SpeechModule }).ExpoSpeechRecognitionModule;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export type VoiceProblem = 'permission' | 'unavailable' | 'failed';

/** Errors that just mean "nothing to send", not a problem to report. */
const QUIET_ERRORS = new Set(['aborted', 'no-speech', 'speech-timeout']);

export function useHoldToTalk({
  onPartial,
  onFinal,
  onProblem,
}: {
  /** Live transcript while holding. */
  onPartial: (text: string) => void;
  /** The transcript after release; not called when nothing was heard. */
  onFinal: (text: string) => void;
  onProblem: (p: VoiceProblem) => void;
}) {
  const mod = speech();
  const [listening, setListening] = useState(false);
  const transcript = useRef('');
  const released = useRef(false);
  const active = useRef(false);
  const handlers = useRef({ onPartial, onFinal, onProblem });
  useEffect(() => {
    handlers.current = { onPartial, onFinal, onProblem };
  });

  useEffect(() => {
    if (!mod) return;
    const subs = [
      mod.addListener('result', (e) => {
        transcript.current = e.results[0]?.transcript ?? transcript.current;
        handlers.current.onPartial(transcript.current);
      }),
      mod.addListener('error', (e) => {
        if (!QUIET_ERRORS.has(e.error)) handlers.current.onProblem(e.error === 'not-allowed' ? 'permission' : 'failed');
      }),
      mod.addListener('end', () => {
        active.current = false;
        setListening(false);
        const text = transcript.current.trim();
        transcript.current = '';
        if (released.current && text) handlers.current.onFinal(text);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [mod]);

  const start = async () => {
    if (!mod) return;
    released.current = false;
    transcript.current = '';
    if (!mod.isRecognitionAvailable()) {
      handlers.current.onProblem('unavailable');
      return;
    }
    const perm = await mod.requestPermissionsAsync();
    if (!perm.granted) {
      handlers.current.onProblem('permission');
      return;
    }
    // Let go while the permission sheet was up: don't start listening after the fact.
    if (released.current) return;
    active.current = true;
    setListening(true);
    mod.start({
      interimResults: true,
      addsPunctuation: true,
      requiresOnDeviceRecognition: mod.supportsOnDeviceRecognition(),
    });
  };

  const stop = () => {
    released.current = true;
    if (active.current) mod?.stop();
  };

  return { available: !!mod, listening, start, stop, onDevice: !!mod?.supportsOnDeviceRecognition() };
}
