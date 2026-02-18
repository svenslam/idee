
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { 
    Plus, Search, Mic, FileText, Sparkles, Command, 
    Loader2, Trash2, MessageSquare, Lightbulb, X, Volume2, Save, Send
} from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";

// --- Types ---
type NoteType = 'text' | 'voice' | 'idea';

interface Note {
    id: string;
    title: string;
    content: string;
    type: NoteType;
    createdAt: number;
    tags: string[];
}

// --- Utils ---
// Use process.env.API_KEY directly as per guidelines
const getGeminiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const aiProcess = async (content: string) => {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyseer deze notitie: "${content}". 
        Geef een JSON object terug met: 
        1. "title": een korte pakkende titel (max 5 woorden).
        2. "tags": 2 of 3 korte tags.
        3. "type": of het een "idea" of "text" is.
        Antwoord ONLY met de JSON.`,
        config: { responseMimeType: "application/json" }
    });
    try {
        return JSON.parse(response.text || "{}");
    } catch (e) {
        return { title: content.substring(0, 20), tags: ["notitie"], type: "text" };
    }
};

function encodeAudio(bytes: Uint8Array) {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function decodeAudio(base64: string) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
}

async function decodeAudioToBuffer(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
    return buffer;
}

// --- Components ---

const VoiceModal = ({ onClose, onSave }: { onClose: () => void, onSave: (note: Partial<Note>) => void }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [status, setStatus] = useState('Klaar om te luisteren');
    const [transcription, setTranscription] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    
    const sessionRef = useRef<any>(null);
    const inputAudioCtxRef = useRef<AudioContext | null>(null);
    const outputAudioCtxRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef(0);
    const sourcesRef = useRef(new Set<AudioBufferSourceNode>());

    const cleanup = useCallback(() => {
        setIsRecording(false);
        if (sessionRef.current) { try { sessionRef.current.close(); } catch(e){} }
        sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
        sourcesRef.current.clear();
        if (inputAudioCtxRef.current) inputAudioCtxRef.current.close();
        if (outputAudioCtxRef.current) outputAudioCtxRef.current.close();
        inputAudioCtxRef.current = null;
        outputAudioCtxRef.current = null;
    }, []);

    const startSession = async () => {
        setStatus('Verbinden...');
        try {
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            const inputCtx = new AudioContextClass({ sampleRate: 16000 });
            const outputCtx = new AudioContextClass({ sampleRate: 24000 });
            inputAudioCtxRef.current = inputCtx;
            outputAudioCtxRef.current = outputCtx;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Initialize Gemini client right before use
            const ai = getGeminiClient();
            
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                callbacks: {
                    onopen: () => {
                        setIsRecording(true);
                        setStatus('Luisteren...');
                        const source = inputCtx.createMediaStreamSource(stream);
                        const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
                        scriptProcessor.onaudioprocess = (e: any) => {
                            const inputData = e.inputBuffer.getChannelData(0);
                            const int16 = new Int16Array(inputData.length);
                            for (let i = 0; i < inputData.length; i++) int16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
                            // Send input only after session promise resolves to avoid race conditions
                            sessionPromise.then(s => s.sendRealtimeInput({ 
                                media: { data: encodeAudio(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } 
                            }));
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputCtx.destination);
                    },
                    onmessage: async (msg) => {
                        if (msg.serverContent?.inputTranscription) setTranscription(prev => prev + msg.serverContent.inputTranscription.text);
                        if (msg.serverContent?.outputTranscription) setAiResponse(prev => prev + msg.serverContent.outputTranscription.text);
                        
                        const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (audioData && outputAudioCtxRef.current) {
                            const buffer = await decodeAudioToBuffer(decodeAudio(audioData), outputAudioCtxRef.current, 24000, 1);
                            const source = outputAudioCtxRef.current.createBufferSource();
                            source.buffer = buffer;
                            source.connect(outputAudioCtxRef.current.destination);
                            const st = Math.max(nextStartTimeRef.current, outputAudioCtxRef.current.currentTime);
                            source.start(st);
                            nextStartTimeRef.current = st + buffer.duration;
                            sourcesRef.current.add(source);
                        }
                    },
                    onclose: () => cleanup(),
                    onerror: (e) => { console.error(e); cleanup(); }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: 'Je bent een hulpvaardige assistent voor snelle notities. Houd je antwoorden kort en bondig in het Nederlands.',
                    inputAudioTranscription: {},
                    outputAudioTranscription: {}
                }
            });
            sessionRef.current = await sessionPromise;
        } catch (e) {
            setStatus('Fout bij verbinden');
            console.error(e);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="p-8 flex flex-col items-center text-center">
                    <button onClick={onClose} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600">
                        <X className="w-6 h-6" />
                    </button>
                    
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 transition-all duration-500 ${isRecording ? 'bg-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.4)] scale-110' : 'bg-slate-100'}`}>
                        {isRecording ? <Mic className="w-10 h-10 text-white animate-pulse" /> : <Mic className="w-10 h-10 text-slate-400" />}
                    </div>

                    <h2 className="text-xl font-bold text-slate-800 mb-2">{status}</h2>
                    <p className="text-sm text-slate-500 mb-8">Stel je vraag of spreek een idee in.</p>

                    <div className="w-full bg-slate-50 rounded-2xl p-4 min-h-[120px] max-h-[200px] overflow-y-auto mb-8 text-left space-y-4 text-sm">
                        {transcription && <div className="text-slate-600 italic">" {transcription} "</div>}
                        {aiResponse && <div className="text-emerald-700 font-medium">{aiResponse}</div>}
                        {!transcription && !aiResponse && <div className="text-slate-300 text-center py-8">Begin met praten...</div>}
                    </div>

                    {!isRecording ? (
                        <button onClick={startSession} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold transition-all transform active:scale-95 flex items-center justify-center gap-2">
                            Start Gesprek
                        </button>
                    ) : (
                        <div className="flex gap-3 w-full">
                            <button onClick={cleanup} className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold transition-all">
                                Stop
                            </button>
                            <button 
                                onClick={() => {
                                    onSave({ 
                                        title: "Gesproken Notitie", 
                                        content: `Vraag: ${transcription}\nAntwoord: ${aiResponse}`, 
                                        type: 'voice',
                                        tags: ['spraak']
                                    });
                                    onClose();
                                }} 
                                disabled={!transcription}
                                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                            >
                                <Save className="w-4 h-4" /> Opslaan
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Fix for line 333: Define NoteCard using React.FC to correctly handle intrinsic props like 'key'
const NoteCard: React.FC<{ note: Note, onDelete: (id: string) => void }> = ({ note, onDelete }) => {
    return (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-2 rounded-xl ${note.type === 'idea' ? 'bg-amber-50 text-amber-600' : note.type === 'voice' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {note.type === 'idea' ? <Lightbulb className="w-4 h-4" /> : note.type === 'voice' ? <Mic className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </div>
                <button onClick={() => onDelete(note.id)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
            <h3 className="font-bold text-slate-800 mb-2 line-clamp-2">{note.title}</h3>
            <p className="text-slate-500 text-sm mb-6 flex-grow line-clamp-4 whitespace-pre-wrap">{note.content}</p>
            <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-50">
                {note.tags.map(tag => (
                    <span key={tag} className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 px-2 py-1 rounded-md">
                        #{tag}
                    </span>
                ))}
            </div>
        </div>
    );
};

// --- App ---

const App = () => {
    const [notes, setNotes] = useState<Note[]>(() => {
        const saved = localStorage.getItem('ideaspark_notes');
        return saved ? JSON.parse(saved) : [];
    });
    const [input, setInput] = useState('');
    const [search, setSearch] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isVoiceOpen, setIsVoiceOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem('ideaspark_notes', JSON.stringify(notes));
    }, [notes]);

    const handleSaveNote = async () => {
        if (!input.trim() || isProcessing) return;
        setIsProcessing(true);
        const content = input.trim();
        setInput('');

        const result = await aiProcess(content);
        const newNote: Note = {
            id: Math.random().toString(36).substr(2, 9),
            title: result.title || "Nieuwe Notitie",
            content,
            type: result.type || 'text',
            createdAt: Date.now(),
            tags: result.tags || ['notitie']
        };
        setNotes(prev => [newNote, ...prev]);
        setIsProcessing(false);
    };

    const filteredNotes = useMemo(() => {
        return notes.filter(n => 
            n.title.toLowerCase().includes(search.toLowerCase()) || 
            n.content.toLowerCase().includes(search.toLowerCase()) ||
            n.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
        );
    }, [notes, search]);

    return (
        <div className="min-h-screen pb-20">
            {/* Header */}
            <nav className="glass sticky top-0 z-40 border-b border-slate-100">
                <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">IdeaSpark</h1>
                    </div>
                    <div className="relative flex-grow max-w-xs mx-4 hidden md:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Doorzoek ideeën..." 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full bg-slate-100/50 border-none rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                        />
                    </div>
                </div>
            </nav>

            <main className="max-w-6xl mx-auto px-6 py-12">
                {/* Input Section */}
                <div className="mb-16">
                    <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 p-2 border border-slate-100 focus-within:ring-2 ring-emerald-500/20 transition-all">
                        <textarea 
                            className="w-full bg-transparent border-none focus:ring-0 p-6 text-lg font-medium placeholder-slate-300 min-h-[120px] resize-none"
                            placeholder="Wat zit er in je hoofd?"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSaveNote(); }}
                        />
                        <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-[1.5rem]">
                            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest px-4">
                                <Command className="w-3 h-3" /> ENTER
                            </div>
                            <button 
                                onClick={handleSaveNote}
                                disabled={!input.trim() || isProcessing}
                                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white px-8 py-3 rounded-xl font-bold transition-all transform active:scale-95 shadow-lg shadow-emerald-200 flex items-center gap-2"
                            >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                <span>Bewaar</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredNotes.length > 0 ? (
                        filteredNotes.map(note => (
                            <NoteCard key={note.id} note={note} onDelete={id => setNotes(prev => prev.filter(n => n.id !== id))} />
                        ))
                    ) : (
                        <div className="col-span-full py-20 text-center">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <FileText className="w-8 h-8 text-slate-200" />
                            </div>
                            <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nog geen notities gevonden</h3>
                        </div>
                    )}
                </div>
            </main>

            {/* Floating Action Button */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40">
                <button 
                    onClick={() => setIsVoiceOpen(true)}
                    className="group relative flex items-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-5 rounded-full shadow-2xl shadow-emerald-200 transition-all transform hover:scale-105 active:scale-90"
                >
                    <div className="absolute inset-0 bg-emerald-400 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                    <Mic className="w-6 h-6 relative z-10" />
                    <span className="font-bold relative z-10">Praat met AI</span>
                </button>
            </div>

            {isVoiceOpen && (
                <VoiceModal 
                    onClose={() => setIsVoiceOpen(false)} 
                    onSave={n => setNotes(prev => [{ ...n, id: Math.random().toString(36).substr(2, 9), createdAt: Date.now() } as Note, ...prev])} 
                />
            )}
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}
