
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Mic, 
  FileText, 
  Sparkles,
  Command
} from 'lucide-react';
import { Note, NoteType } from './types.ts';
import NoteCard from './components/NoteCard.tsx';
import VoiceAssistant from './components/VoiceAssistant.tsx';
import { summarizeNote, categorizeNote } from './services/geminiService.ts';

const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>(() => {
    const saved = localStorage.getItem('ideaspark_notes');
    return saved ? JSON.parse(saved) : [];
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
    if (!newNoteContent.trim()) return;
    
    setIsProcessing(true);
    const id = crypto.randomUUID();
    
    // Initial optimistic add
    const tempNote: Note = {
      id,
      title: "Verwerken...",
      content: newNoteContent,
      type: 'text',
      createdAt: Date.now(),
      tags: []
    };
    
    setNotes(prev => [tempNote, ...prev]);
    setNewNoteContent('');

    try {
      const [title, tags] = await Promise.all([
        summarizeNote(newNoteContent),
        categorizeNote(newNoteContent)
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
        title: "Nieuwe Notitie",
        tags: ['notitie']
      } : n));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveVoiceNote = (noteData: Partial<Note>) => {
    const newNote: Note = {
      id: crypto.randomUUID(),
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
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20 selection:bg-emerald-100 selection:text-emerald-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-2 rounded-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-gray-900">IdeaSpark</h1>
          </div>
          
          <div className="hidden md:flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            <button 
              onClick={() => setFilterType('all')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${filterType === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Alles
            </button>
            <button 
              onClick={() => setFilterType('idea')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${filterType === 'idea' ? 'bg-white shadow-sm text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Ideeën
            </button>
            <button 
              onClick={() => setFilterType('voice')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${filterType === 'voice' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Gesproken
            </button>
          </div>

          <div className="relative group max-w-xs w-full ml-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Zoeken..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 border-none rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <section className="mb-12">
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden p-1">
            <div className="relative">
              <textarea 
                placeholder="Leg een nieuw idee of snelle gedachte vast..."
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    addNote();
                  }
                }}
                className="w-full min-h-[120px] p-6 text-lg border-none focus:ring-0 outline-none resize-none placeholder-gray-300 font-medium"
              />
              <div className="flex items-center justify-between p-4 border-t border-gray-50 bg-gray-50/50">
                <div className="flex items-center gap-4 text-gray-400">
                  <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider">
                    <Command className="w-3 h-3" />
                    <span>+ Enter om op te slaan</span>
                  </div>
                </div>
                <button 
                  onClick={addNote}
                  disabled={!newNoteContent.trim() || isProcessing}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-200 active:scale-95"
                >
                  {isProcessing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span>Opslaan</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              Je Notities
              <span className="bg-emerald-100 text-emerald-700 text-xs py-1 px-2.5 rounded-full font-bold">
                {filteredNotes.length}
              </span>
            </h2>
          </div>

          {filteredNotes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredNotes.map(note => (
                <NoteCard 
                  key={note.id} 
                  note={note} 
                  onDelete={deleteNote} 
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-100">
              <div className="bg-gray-50 p-6 rounded-full mb-4">
                <FileText className="w-12 h-12 text-gray-200" />
              </div>
              <p className="text-gray-400 font-medium text-lg">Geen notities gevonden</p>
              <p className="text-gray-300 text-sm mt-1">Begin met typen hierboven of stel een vraag via de microfoon.</p>
            </div>
          )}
        </section>
      </main>

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 z-40">
        <button 
          onClick={() => setIsVoiceOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white w-14 h-14 rounded-full shadow-2xl shadow-emerald-300 flex items-center justify-center transition-all hover:scale-110 active:scale-95 group"
          title="Stel een gesproken vraag"
        >
          <Mic className="w-6 h-6 group-hover:animate-pulse" />
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
