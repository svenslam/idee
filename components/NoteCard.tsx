
import React from 'react';
import { Note } from '../types.ts';
import { Trash2, MessageSquare, Lightbulb, Mic } from 'lucide-react';

interface NoteCardProps {
  note: Note;
  onDelete: (id: string) => void;
}

const NoteCard: React.FC<NoteCardProps> = ({ note, onDelete }) => {
  const getTypeIcon = () => {
    switch (note.type) {
      case 'voice': return <Mic className="w-4 h-4 text-blue-500" />;
      case 'idea': return <Lightbulb className="w-4 h-4 text-amber-500" />;
      default: return <MessageSquare className="w-4 h-4 text-emerald-500" />;
    }
  };

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat('nl-NL', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow group relative flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {getTypeIcon()}
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {note.type}
          </span>
        </div>
        <button 
          onClick={() => onDelete(note.id)}
          className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      <h3 className="font-bold text-gray-800 mb-2 text-lg leading-tight">
        {note.title}
      </h3>
      
      <p className="text-gray-600 text-sm flex-grow whitespace-pre-wrap line-clamp-4">
        {note.content}
      </p>

      <div className="mt-4 pt-3 border-t border-gray-50 flex flex-wrap gap-1 items-center">
        {note.tags.map((tag, idx) => (
          <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded-full font-medium">
            #{tag}
          </span>
        ))}
        <span className="ml-auto text-[10px] text-gray-400 font-medium italic">
          {formatDate(note.createdAt)}
        </span>
      </div>
    </div>
  );
};

export default NoteCard;
