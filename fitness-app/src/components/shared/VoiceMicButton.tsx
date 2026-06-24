import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useSpeech } from '../../hooks/useSpeech';
import { useEffect, useRef } from 'react';
import { toast } from './Toast';

interface Props {
  onTranscript: (text: string) => void;
  position?: 'workout' | 'nutrition';
  disabled?: boolean;
  isProcessing?: boolean;
}

export function VoiceMicButton({ onTranscript, position = 'nutrition', disabled, isProcessing }: Props) {
  const { isListening, transcript, isSupported, startListening, stopListening, error } = useSpeech();
  const lastTranscript = useRef('');

  useEffect(() => {
    if (transcript && transcript !== lastTranscript.current) {
      lastTranscript.current = transcript;
      onTranscript(transcript);
    }
  }, [transcript, onTranscript]);

  useEffect(() => {
    if (error) toast(error, 'error');
  }, [error]);

  if (!isSupported) return null;

  const posClass = position === 'workout' ? 'bottom-32 right-4' : 'bottom-20 right-4';
  const isActive = isListening || isProcessing;

  return (
    <button
      onClick={() => {
        if (isListening) { stopListening(); return; }
        if (!disabled && !isProcessing) startListening();
      }}
      disabled={disabled && !isListening}
      className={`fixed ${posClass} z-[110] w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-90 ${
        isListening ? 'bg-danger animate-pulse' :
        isProcessing ? 'bg-surface-raised' :
        'bg-accent-blue'
      }`}
    >
      {isProcessing ? (
        <Loader2 size={22} className="text-text-muted animate-spin" />
      ) : isListening ? (
        <Mic size={22} className="text-white" />
      ) : (
        <Mic size={22} className="text-white" />
      )}
    </button>
  );
}
