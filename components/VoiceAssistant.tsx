
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, X, Volume2, Save, Loader2 } from 'lucide-react';
import { getGeminiClient, encode, decode, decodeAudioData } from '../services/geminiService.ts';
import { LiveServerMessage, Modality, Blob as GeminiBlob } from '@google/genai';
import { Note } from '../types.ts';

interface VoiceAssistantProps {
  onClose: () => void;
  onSaveNote: (note: Partial<Note>) => void;
}

const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ onClose, onSaveNote }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    setIsRecording(false);
    setIsConnecting(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) {}
      sessionRef.current = null;
    }

    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
    sourcesRef.current.clear();
    
    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== 'closed') {
      inputAudioCtxRef.current.close().catch(() => {});
    }
    if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== 'closed') {
      outputAudioCtxRef.current.close().catch(() => {});
    }
    
    inputAudioCtxRef.current = null;
    outputAudioCtxRef.current = null;
    nextStartTimeRef.current = 0;
  }, []);

  const startSession = async () => {
    if (isConnecting || isRecording) return;
    
    setIsConnecting(true);
    setTranscription('');
    setAiResponse('');
    
    try {
      // 1. Maak AudioContexts aan (moet in click handler voor iOS)
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      // 2. Resume contexts direct (essentieel voor Safari)
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();
      
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;

      // 3. Vraag microfoon permissie
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;

      const ai = getGeminiClient();
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsRecording(true);
            setIsConnecting(false);

            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (inputCtx.state !== 'running') return;
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                int16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
              }
              const pcmBlob: GeminiBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              
              sessionPromise.then(session => {
                if (session && inputAudioCtxRef.current) {
                  session.sendRealtimeInput({ media: pcmBlob });
                }
              }).catch(() => {});
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              setAiResponse(prev => prev + message.serverContent!.outputTranscription!.text);
            }
            if (message.serverContent?.inputTranscription) {
              setTranscription(prev => prev + message.serverContent!.inputTranscription!.text);
            }

            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioCtxRef.current) {
              const currentCtx = outputAudioCtxRef.current;
              if (currentCtx.state === 'suspended') await currentCtx.resume();
              
              const buffer = await decodeAudioData(decode(audioData), currentCtx, 24000, 1);
              const source = currentCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(currentCtx.destination);
              
              const startTime = Math.max(nextStartTimeRef.current, currentCtx.currentTime);
              source.start(startTime);
              nextStartTimeRef.current = startTime + buffer.duration;
              
              sourcesRef.current.add(source);
              source.onended = () => sourcesRef.current.delete(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Gemini Session Error:', e);
            cleanup();
          },
          onclose: () => cleanup()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'Je bent IdeaSpark, een snelle notitie-assistent. Geef korte, krachtige antwoorden in het Nederlands.',
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {}
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (error) {
      console.error('Failed to start session:', error);
      cleanup();
    }
  };

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="bg-emerald-600 p-6 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <Volume2 className="w-5 h-5" />
            <h2 className="text-lg font-bold">Assistent</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-90">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div className="flex flex-col items-center">
            <button
              onClick={isRecording ? cleanup : startSession}
              disabled={isConnecting}
              className={`w-24 h-24 rounded-full flex items-center justify-center shadow-xl transition-all transform active:scale-75 touch-none ${
                isRecording 
                  ? 'bg-red-500 ring-8 ring-red-50' 
                  : 'bg-emerald-500 ring-8 ring-emerald-50'
              } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isConnecting ? (
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              ) : (
                <Mic className={`w-10 h-10 text-white ${isRecording ? 'animate-pulse' : ''}`} />
              )}
            </button>
            <p className="mt-6 font-bold text-gray-400 uppercase tracking-widest text-[10px] pointer-events-none">
              {isConnecting ? 'VERBINDEN...' : isRecording ? 'IK LUISTER...' : 'TIK OM TE STARTEN'}
            </p>
          </div>

          <div className="space-y-4 max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar min-h-[100px] flex flex-col">
            {transcription && (
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 self-end max-w-[90%] animate-in slide-in-from-right-4">
                <p className="text-gray-700 text-sm leading-relaxed">{transcription}</p>
              </div>
            )}
            {aiResponse && (
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 self-start max-w-[90%] animate-in slide-in-from-left-4">
                <p className="text-gray-800 text-sm font-medium leading-relaxed">{aiResponse}</p>
              </div>
            )}
            {!transcription && !aiResponse && !isConnecting && !isRecording && (
              <p className="text-center text-gray-300 text-sm italic mt-4 px-4">Stel een vraag of vertel me je idee.</p>
            )}
          </div>

          {(transcription || aiResponse) && (
            <button
              onClick={() => {
                onSaveNote({
                  title: transcription.substring(0, 30) || "Gesproken Notitie",
                  content: `${transcription}\n\nAntwoord: ${aiResponse}`,
                  tags: ['spraak']
                });
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-4 rounded-2xl font-bold hover:bg-black transition-all shadow-lg active:scale-95"
            >
              <Save className="w-4 h-4" />
              Opslaan in IdeaSpark
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistant;
