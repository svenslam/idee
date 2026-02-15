
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, X, Loader2, Volume2, Save } from 'lucide-react';
import { getGeminiClient, encode, decode, decodeAudioData } from '../services/geminiService';
import { LiveServerMessage, Modality, Blob as GeminiBlob } from '@google/genai';
import { Note } from '../types';

interface VoiceAssistantProps {
  onClose: () => void;
  onSaveNote: (note: Partial<Note>) => void;
}

const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ onClose, onSaveNote }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleStop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (sessionRef.current) {
      sessionRef.current.close();
    }
    setIsRecording(false);
  }, []);

  const startSession = async () => {
    setIsConnecting(true);
    try {
      const ai = getGeminiClient();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = inputAudioCtx;
      outputAudioContextRef.current = outputAudioCtx;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.log('Gemini Live session opened');
            setIsRecording(true);
            setIsConnecting(false);

            const source = inputAudioCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob: GeminiBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              setAiResponse(prev => prev + message.serverContent!.outputTranscription!.text);
            }
            if (message.serverContent?.inputTranscription) {
              setTranscription(prev => prev + message.serverContent!.inputTranscription!.text);
            }

            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioCtx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), outputAudioCtx, 24000, 1);
              const source = outputAudioCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputAudioCtx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
              source.onended = () => sourcesRef.current.delete(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Session error:', e);
            handleStop();
          },
          onclose: () => {
            console.log('Session closed');
            handleStop();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'Je bent een behulpzame notitie-assistent genaamd IdeaSpark. Beantwoord de vraag van de gebruiker kort en krachtig. Help bij het brainstormen of vastleggen van snelle gedachten.',
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {}
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (error) {
      console.error('Failed to start voice session:', error);
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    return () => {
      handleStop();
    };
  }, [handleStop]);

  const handleSaveAsNote = () => {
    onSaveNote({
      title: transcription.slice(0, 30) || "Gesproken Notitie",
      content: `Vraag: ${transcription}\nAntwoord: ${aiResponse}`,
      type: 'voice',
      tags: ['gesproken', 'vraag']
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="bg-emerald-600 p-6 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <Volume2 className="w-6 h-6" />
            <h2 className="text-xl font-bold">Stel een Vraag</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="flex flex-col items-center justify-center py-4">
            <button
              onClick={isRecording ? handleStop : startSession}
              disabled={isConnecting}
              className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all transform active:scale-95 ${
                isRecording 
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse ring-8 ring-red-100' 
                  : 'bg-emerald-500 hover:bg-emerald-600 ring-8 ring-emerald-50'
              } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isConnecting ? (
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              ) : (
                <Mic className="w-10 h-10 text-white" />
              )}
            </button>
            <p className="mt-6 font-semibold text-gray-500 uppercase tracking-widest text-xs">
              {isConnecting ? 'Verbinden...' : isRecording ? 'Ik luister...' : 'Tik om te praten'}
            </p>
          </div>

          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {transcription && (
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Jij</span>
                <p className="text-gray-700 mt-1 leading-relaxed">{transcription}</p>
              </div>
            )}
            {aiResponse && (
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                <span className="text-[10px] font-bold text-emerald-600 uppercase">IdeaSpark</span>
                <p className="text-gray-800 mt-1 leading-relaxed">{aiResponse}</p>
              </div>
            )}
          </div>

          {(transcription || aiResponse) && (
            <button
              onClick={handleSaveAsNote}
              className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-black text-white py-4 rounded-2xl font-bold transition-all shadow-md active:scale-[0.98]"
            >
              <Save className="w-5 h-5" />
              Opslaan als notitie
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistant;
