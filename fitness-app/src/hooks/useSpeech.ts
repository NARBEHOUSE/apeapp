import { useState, useCallback, useRef } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
const SpeechRecognitionImpl: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

interface UseSpeechReturn {
  isListening: boolean;
  transcript: string;
  isSupported: boolean;
  isSpeaking: boolean;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => Promise<void>;
  cancelSpeech: () => void;
  error: string | null;
}

export function useSpeech(): UseSpeechReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const isSupported = !!SpeechRecognitionImpl;

  const cancelSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionImpl) {
      setError('Speech recognition not supported');
      return;
    }

    cancelSpeech();
    setError(null);
    setTranscript('');

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      const result = event.results?.[0]?.[0]?.transcript || '';
      setTranscript(result);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        setError(null);
      } else if (event.error === 'not-allowed') {
        setError('Microphone access denied');
      } else {
        setError(`Speech error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [cancelSpeech]);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
      cancelSpeech();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => { setIsSpeaking(false); resolve(); };
      utterance.onerror = () => { setIsSpeaking(false); resolve(); };
      window.speechSynthesis.speak(utterance);
    });
  }, [cancelSpeech]);

  return {
    isListening, transcript, isSupported, isSpeaking,
    startListening, stopListening, speak, cancelSpeech, error,
  };
}
