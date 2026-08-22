/** Voice-to-text using the browser's built-in speech recognition.
 *
 * Chose the Web Speech API over a cloud transcription service deliberately: it
 * needs no API key, no per-request cost and no upload of respondent audio, and
 * Android Chrome supports hi-IN, bn-IN, ta-IN, te-IN, mr-IN and gu-IN — exactly
 * the languages this app ships in.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/* The Web Speech API is not in TypeScript's DOM lib, so declare what we use. */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function isVoiceSupported(): boolean {
  return recognitionConstructor() !== null;
}

export type VoiceErrorKey =
  | 'voice.unsupported'
  | 'voice.permission'
  | 'voice.noSpeech'
  | 'voice.error';

export interface VoiceState {
  supported: boolean;
  listening: boolean;
  interim: string;
  errorKey: VoiceErrorKey | null;
  start: () => void;
  stop: () => void;
}

/**
 * Dictation hook. `onResult` receives the final transcript; `interim` streams
 * partial text so the enumerator can see recognition working.
 */
export function useSpeechRecognition(
  locale: string,
  onResult: (text: string) => void,
): VoiceState {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [errorKey, setErrorKey] = useState<VoiceErrorKey | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  const gotResultRef = useRef(false);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const supported = recognitionConstructor() !== null;

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setErrorKey('voice.unsupported');
      return;
    }

    // Restarting a live instance throws in Chrome; tear the old one down first.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }

    const recognition = new Constructor();
    recognition.lang = locale;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    gotResultRef.current = false;
    setErrorKey(null);
    setInterim('');

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      let finalText = '';
      let partial = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const alternative = result[0];
        if (!alternative) continue;
        if (result.isFinal) finalText += alternative.transcript;
        else partial += alternative.transcript;
      }
      if (partial) setInterim(partial);
      if (finalText.trim()) {
        gotResultRef.current = true;
        setInterim('');
        onResultRef.current(finalText.trim());
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setErrorKey('voice.permission');
      } else if (event.error === 'no-speech') {
        setErrorKey('voice.noSpeech');
      } else if (event.error !== 'aborted') {
        setErrorKey('voice.error');
      }
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setInterim('');
      if (!gotResultRef.current) {
        setErrorKey((current) => current ?? 'voice.noSpeech');
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setErrorKey('voice.error');
      setListening(false);
    }
  }, [locale]);

  useEffect(
    () => () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          recognition.abort();
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  return { supported, listening, interim, errorKey, start, stop };
}

/** Extract a plausible age from spoken text in several scripts. */
export function parseSpokenNumber(text: string): number | null {
  const normalised = text
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966)) // Devanagari
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6)) // Bengali
    .replace(/[௦-௯]/g, (d) => String(d.charCodeAt(0) - 0x0be6)) // Tamil
    .replace(/[౦-౯]/g, (d) => String(d.charCodeAt(0) - 0x0c66)) // Telugu
    .replace(/[૦-૯]/g, (d) => String(d.charCodeAt(0) - 0x0ae6)); // Gujarati

  const match = normalised.match(/\d{1,3}/);
  if (!match) return null;
  const value = Number.parseInt(match[0], 10);
  return Number.isFinite(value) ? value : null;
}
