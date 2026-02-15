
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Mic, 
  FileText, 
  Sparkles,
  Command,
  Loader2
} from 'lucide-react';
import { Note, NoteType } from './types.ts';
import NoteCard from './components/NoteCard.tsx';
import VoiceAssistant from './components/VoiceAssistant.tsx';
import { summarizeNote, categorizeNote } from './services/geminiService.ts';

// Fallback voor omgevingen zonder crypto.randomUUID (zoals sommige oudere mobiele browsers)
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
};

const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>(() => {
    try {
      const saved = localStorage.getItem('ideaspark_notes');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterType, setFilterType] = useState<NoteType | 'all'>('all');

  useEffect(() => {
    localStorage.setItem('ideaspark_notes', JSON.stringify(notes));
  }, [notes]);

  const addNote = async () => {
    const content = newNoteContent.trim();
    if (!content) return;
    
    setIsProcessing(true);
    const id = generateId();
    
    const tempNote: Note = {
      id,
      title: "Verwerken...",
      content: content,
      type: 'text',
      createdAt: Date.now(),
      tags: []
    };
    
    setNotes(prev => [tempNote, ...prev]);
    setNewNoteContent('');

    try {
      const [title, tags] = await Promise.all([
        summarizeNote(content),
        categorizeNote(content)
      ]);

      const type: NoteType = tags.includes('idee') || tags.includes('concept') ? 'idea' : 'text';

      setNotes(prev => prev.map(n => n.id === id ? {
        ...n,
        title,
        tags,
        type
      } : n));
    } catch (err) {
      console.error("AI error:", err);
      setNotes(prev => prev.map(n => n.id === id ? {
        ...n,
        title: content.substring(0, 20) + "...",
        tags: ['notitie']
      } : n));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveVoiceNote = (noteData: Partial<Note>) => {
    const newNote: Note = {
      id: generateId(),
      title: noteData.title || "Gesproken Notitie",
      content: noteData.content || "",
      type: 'voice',
      createdAt: Date.now(),
      tags: noteData.tags || ['gesproken']
    };
    setNotes(prev => [newNote, ...prev]);
  };

  const deleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const filteredNotes = useMemo(() => {
    return notes
      .filter(n => filterType === 'all' || n.type === filterType)
      .filter(n => 
        n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      );
  }, [notes, searchQuery, filterType]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-24 selection:bg-emerald-100 selection:text-emerald-900">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-1.5 rounded-lg shadow-sm">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-black tracking-tight text-gray-900">IdeaSpark</h1>
          </div>
          
          <div className="hidden sm:flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {(['all', 'idea', 'voice'] as const).map((t) => (
              <button 
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterType === t ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                {t === 'all' ? 'Alles' : t === 'idea' ? 'Ideeën' : 'Spraak'}
              </button>
            ))}
          </div>

          <div className="relative group max-w-[150px] sm:max-w-xs w-full ml-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Zoeken..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 border-none rounded-xl py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <section className="mb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <textarea 
              placeholder="Snel een idee opslaan..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  addNote();
                }
              }}
              className="w-full min-h-[100px] p-5 text-base border-none focus:ring-0 outline-none resize-none placeholder-gray-300 font-medium"
            />
            <div className="flex items-center justify-between p-3 border-t border-gray-50 bg-gray-50/50">
              <div className="flex items-center gap-2 text-gray-400 pl-2">
                <Command className="w-3.5 h-3.5 hidden sm:block" />
                <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:block">CMD + Enter om op te slaan</span>
              </div>
              <button 
                onClick={addNote}
                disabled={!newNoteContent.trim() || isProcessing}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white px-5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 text-sm"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>Opslaan</span>
              </button>
            </div>
          </div>
        </section>

        <section>
          {filteredNotes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredNotes.map(note => (
                <NoteCard key={note.id} note={note} onDelete={deleteNote} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-3xl border-2 border-dashed border-gray-100">
              <FileText className="w-12 h-12 text-gray-200 mb-3" />
              <p className="text-gray-400 font-medium">Geen notities</p>
            </div>
          )}
        </section>
      </main>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <button 
          onClick={() => setIsVoiceOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all active:scale-90"
          title="Stel een gesproken vraag"
        >
          <Mic className="w-6 h-6" />
        </button>
      </div>

      {isVoiceOpen && (
        <VoiceAssistant 
          onClose={() => setIsVoiceOpen(false)} 
          onSaveNote={handleSaveVoiceNote} 
        />
      )}
    </div>
  );
};

export default App;
