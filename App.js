import { useState, useEffect } from 'react';

export default function ZettelkastenApp() {
  const [notes, setNotes] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list', 'edit', 'view'
  const [directoryHandle, setDirectoryHandle] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // If we have a directory handle, load notes from it
    if (directoryHandle) {
      loadNotesFromDirectory();
    } else {
      // Otherwise, fall back to localStorage
      const savedNotes = localStorage.getItem('zettelkasten-notes');
      if (savedNotes) {
        setNotes(JSON.parse(savedNotes));
      }
    }
  }, [directoryHandle]);

  // Save to localStorage as fallback when notes change
  useEffect(() => {
    if (notes.length > 0) {
      localStorage.setItem('zettelkasten-notes', JSON.stringify(notes));
    }
  }, [notes]);

  // Check if File System Access API is available
  const isFileSystemAccessAPIAvailable = () => {
    return 'showDirectoryPicker' in window;
  };

  // Select a directory to save notes
  const selectDirectory = async () => {
    if (!isFileSystemAccessAPIAvailable()) {
      setStatusMessage('Your browser does not support the File System Access API.');
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite',
      });
      setDirectoryHandle(handle);
      setStatusMessage(`Directory "${handle.name}" selected for note storage.`);
      
      // Load notes from the selected directory
      await loadNotesFromDirectory(handle);
    } catch (error) {
      console.error('Error selecting directory:', error);
      setStatusMessage('Directory selection was canceled or failed.');
    }
  };

  // Load notes from the selected directory
  const loadNotesFromDirectory = async (handle = directoryHandle) => {
    if (!handle) return;
    
    setIsLoading(true);
    setStatusMessage('Loading notes...');
    
    try {
      const loadedNotes = [];
      
      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.md')) {
          const file = await entry.getFile();
          const content = await file.text();
          
          // Parse the markdown content
          const note = parseMarkdownToNote(content, entry.name.replace('.md', ''));
          loadedNotes.push(note);
        }
      }
      
      setNotes(loadedNotes);
      setStatusMessage(`Loaded ${loadedNotes.length} notes.`);
    } catch (error) {
      console.error('Error loading notes:', error);
      setStatusMessage('Failed to load notes from directory.');
    } finally {
      setIsLoading(false);
    }
  };

  // Parse markdown content to note object
  const parseMarkdownToNote = (markdown, filename) => {
    const lines = markdown.split('\n');
    let title = filename;
    let content = markdown;
    
    // Check if the first line is a title (# Title)
    if (lines.length > 0 && lines[0].startsWith('# ')) {
      title = lines[0].substring(2).trim();
      content = lines.slice(1).join('\n').trim();
    }
    
    const note = {
      id: filename,
      title: title,
      content: content,
      tags: extractTags(content),
      links: extractLinks(content),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    return note;
  };

  // Convert note to markdown
  const noteToMarkdown = (note) => {
    return `# ${note.title}\n\n${note.content}`;
  };

  // Save a single note to the directory
  const saveNoteToFile = async (note) => {
    if (!directoryHandle) return false;
    
    try {
      // Create a safe filename from the note title
      const safeFilename = note.title
        .replace(/[^a-z0-9]/gi, '-')
        .toLowerCase() + '.md';
      
      // Try to get the file or create it if it doesn't exist
      const fileHandle = await directoryHandle.getFileHandle(safeFilename, { create: true });
      
      // Convert the note to markdown
      const content = noteToMarkdown(note);
      
      // Write to the file
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      
      return true;
    } catch (error) {
      console.error('Error saving note to file:', error);
      setStatusMessage(`Failed to save note "${note.title}".`);
      return false;
    }
  };

  // Save all notes to directory
  const saveAllNotesToFiles = async () => {
    if (!directoryHandle) {
      setStatusMessage('No directory selected for saving notes.');
      return;
    }
    
    setIsLoading(true);
    setStatusMessage('Saving notes...');
    
    try {
      let savedCount = 0;
      
      for (const note of notes) {
        const success = await saveNoteToFile(note);
        if (success) savedCount++;
      }
      
      setStatusMessage(`Saved ${savedCount} of ${notes.length} notes to files.`);
    } catch (error) {
      console.error('Error saving notes:', error);
      setStatusMessage('Failed to save some notes.');
    } finally {
      setIsLoading(false);
    }
  };

  // Export all notes as a single markdown file
  const exportNotesAsMarkdown = () => {
    const markdown = notes.map(note => {
      return `# ${note.title}\n\n${note.content}\n\n---\n\n`;
    }).join('');
    
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zettelkasten-notes.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setStatusMessage('Notes exported as markdown.');
  };

  // Export notes as JSON
  const exportNotesAsJSON = () => {
    const json = JSON.stringify(notes, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zettelkasten-notes.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setStatusMessage('Notes exported as JSON.');
  };

  // Import notes from JSON file
  const importNotesFromJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const importedNotes = JSON.parse(text);
        
        if (Array.isArray(importedNotes)) {
          setNotes(importedNotes);
          setStatusMessage(`Imported ${importedNotes.length} notes.`);
          
          // If we have a directory handle, save the imported notes
          if (directoryHandle) {
            saveAllNotesToFiles();
          }
        } else {
          setStatusMessage('Invalid notes format in the imported file.');
        }
      } catch (error) {
        console.error('Error importing notes:', error);
        setStatusMessage('Failed to import notes.');
      }
    };
    input.click();
  };

  // Import notes from markdown files
  const importNotesFromMarkdown = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      
      try {
        const importedNotes = [];
        
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const content = await file.text();
          const filename = file.name.replace('.md', '');
          const note = parseMarkdownToNote(content, filename);
          importedNotes.push(note);
        }
        
        setNotes([...notes, ...importedNotes]);
        setStatusMessage(`Imported ${importedNotes.length} notes.`);
        
        // If we have a directory handle, save the imported notes
        if (directoryHandle) {
          saveAllNotesToFiles();
        }
      } catch (error) {
        console.error('Error importing markdown notes:', error);
        setStatusMessage('Failed to import some markdown notes.');
      }
    };
    input.click();
  };

  const createNewNote = () => {
    const now = new Date();
    const newId = now.getTime().toString();
    const newNote = {
      id: newId,
      title: noteTitle || `Note ${notes.length + 1}`,
      content: noteContent,
      tags: extractTags(noteContent),
      links: extractLinks(noteContent),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    
    const updatedNotes = [...notes, newNote];
    setNotes(updatedNotes);
    setNoteTitle('');
    setNoteContent('');
    setViewMode('list');
    
    // Save to file if we have a directory handle
    if (directoryHandle) {
      saveNoteToFile(newNote);
    }
  };

  const updateNote = () => {
    if (!activeNote) return;
    
    const now = new Date();
    const updatedNote = {
      ...activeNote,
      title: noteTitle,
      content: noteContent,
      tags: extractTags(noteContent),
      links: extractLinks(noteContent),
      updatedAt: now.toISOString()
    };
    
    const updatedNotes = notes.map(note => 
      note.id === activeNote.id ? updatedNote : note
    );
    
    setNotes(updatedNotes);
    setViewMode('view');
    setActiveNote(updatedNote);
    
    // Save to file if we have a directory handle
    if (directoryHandle) {
      saveNoteToFile(updatedNote);
    }
  };

  const deleteNote = async (id) => {
    // If we have a directory handle, try to delete the file
    if (directoryHandle) {
      const noteToDelete = notes.find(note => note.id === id);
      if (noteToDelete) {
        try {
          const safeFilename = noteToDelete.title
            .replace(/[^a-z0-9]/gi, '-')
            .toLowerCase() + '.md';
          await directoryHandle.removeEntry(safeFilename);
        } catch (error) {
          console.error('Error deleting file:', error);
          setStatusMessage(`Failed to delete file for note "${noteToDelete.title}".`);
        }
      }
    }
    
    setNotes(notes.filter(note => note.id !== id));
    
    if (activeNote && activeNote.id === id) {
      setActiveNote(null);
      setViewMode('list');
    }
  };

  const extractTags = (content) => {
    const tagRegex = /#(\w+)/g;
    const matches = content.match(tagRegex);
    return matches ? [...new Set(matches.map(tag => tag.substring(1)))] : [];
  };

  const extractLinks = (content) => {
    const linkRegex = /\[\[(.*?)\]\]/g;
    const matches = content.match(linkRegex);
    return matches ? [...new Set(matches.map(link => link.slice(2, -2)))] : [];
  };

  const viewNote = (note) => {
    setActiveNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setViewMode('view');
  };

  const editNote = () => {
    setViewMode('edit');
  };

  const filteredNotes = notes.filter(note => {
    const matchesSearch = 
      note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  const formatContent = (content) => {
    // Format tags
    let formattedContent = content.replace(/#(\w+)/g, '<span class="text-blue-500 font-medium">#$1</span>');
    
    // Format links
    formattedContent = formattedContent.replace(/\[\[(.*?)\]\]/g, (match, linkText) => {
      const linkedNote = notes.find(note => note.title === linkText);
      return linkedNote 
        ? `<span class="cursor-pointer text-green-600 underline" data-link="${linkText}">${linkText}</span>`
        : `<span class="cursor-pointer text-red-500 underline" data-link="${linkText}">${linkText}</span>`;
    });
    
    return formattedContent;
  };

  const handleLinkClick = (linkText) => {
    const linkedNote = notes.find(note => note.title === linkText);
    if (linkedNote) {
      viewNote(linkedNote);
    } else {
      setNoteTitle(linkText);
      setNoteContent(`This is a new note about ${linkText}`);
      setViewMode('edit');
    }
  };

  const renderNoteContent = () => {
    return (
      <div 
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: formatContent(activeNote.content) }}
        onClick={(e) => {
          if (e.target.dataset.link) {
            handleLinkClick(e.target.dataset.link);
          }
        }}
      />
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-gray-800 text-white p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Zettelkasten Notes</h1>
          <div className="flex gap-2">
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
              onClick={selectDirectory}
            >
              {directoryHandle ? 'Change Directory' : 'Select Directory'}
            </button>
            <div className="relative group">
              <button
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
              >
                Import/Export
              </button>
              <div className="absolute right-0 hidden group-hover:block bg-white shadow-lg rounded p-2 w-48 z-10">
                <button
                  className="block w-full text-left px-2 py-1 hover:bg-gray-100 text-sm"
                  onClick={importNotesFromJSON}
                >
                  Import from JSON
                </button>
                <button
                  className="block w-full text-left px-2 py-1 hover:bg-gray-100 text-sm"
                  onClick={importNotesFromMarkdown}
                >
                  Import Markdown Files
                </button>
                <button
                  className="block w-full text-left px-2 py-1 hover:bg-gray-100 text-sm"
                  onClick={exportNotesAsJSON}
                >
                  Export as JSON
                </button>
                <button
                  className="block w-full text-left px-2 py-1 hover:bg-gray-100 text-sm"
                  onClick={exportNotesAsMarkdown}
                >
                  Export as Markdown
                </button>
                {directoryHandle && (
                  <button
                    className="block w-full text-left px-2 py-1 hover:bg-gray-100 text-sm"
                    onClick={saveAllNotesToFiles}
                  >
                    Save All to Files
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {statusMessage && (
          <div className="mt-2 text-sm bg-gray-700 p-2 rounded">
            {statusMessage}
          </div>
        )}
      </header>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-gray-200 overflow-y-auto p-4 flex flex-col">
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search notes..."
              className="w-full p-2 border rounded"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <button
            className="bg-green-500 text-white p-2 rounded mb-4 hover:bg-green-600"
            onClick={() => {
              setActiveNote(null);
              setNoteTitle('');
              setNoteContent('');
              setViewMode('edit');
            }}
          >
            + New Note
          </button>
          
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-4">
                <p>Loading notes...</p>
              </div>
            ) : filteredNotes.length === 0 ? (
              <p className="text-gray-500 italic">No notes found</p>
            ) : (
              <ul>
                {filteredNotes.map(note => (
                  <li 
                    key={note.id} 
                    className={`p-2 mb-2 rounded cursor-pointer hover:bg-gray-300 ${
                      activeNote && activeNote.id === note.id ? 'bg-gray-300' : 'bg-gray-100'
                    }`}
                    onClick={() => viewNote(note)}
                  >
                    <div className="font-medium">{note.title}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {note.tags.map(tag => (
                        <span key={tag} className="bg-blue-100 text-blue-800 text-xs px-1 rounded">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {viewMode === 'list' && (
            <div className="text-center text-gray-500 mt-20">
              <p className="text-2xl mb-2">Select a note or create a new one</p>
              <p>Use #tags to categorize and [[links]] to connect notes</p>
              {!directoryHandle && (
                <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded max-w-md mx-auto">
                  <p className="font-medium text-yellow-800">Using Browser Storage</p>
                  <p className="text-sm mt-2 text-yellow-700">
                    Select a directory to save notes as Markdown files on your computer instead of in browser storage.
                  </p>
                  <button
                    className="mt-4 bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
                    onClick={selectDirectory}
                  >
                    Select Directory
                  </button>
                </div>
              )}
            </div>
          )}
          
          {viewMode === 'edit' && (
            <div>
              <input
                type="text"
                placeholder="Note Title"
                className="w-full p-2 text-2xl font-bold border-b mb-4"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
              />
              
              <textarea
                placeholder="Note content. Use #tags for categorization and [[Note Title]] to link to other notes."
                className="w-full p-2 border rounded h-96"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
              />
              
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="bg-gray-300 px-4 py-2 rounded"
                  onClick={() => {
                    if (activeNote) {
                      setViewMode('view');
                      setNoteTitle(activeNote.title);
                      setNoteContent(activeNote.content);
                    } else {
                      setViewMode('list');
                    }
                  }}
                >
                  Cancel
                </button>
                <button
                  className="bg-green-500 text-white px-4 py-2 rounded"
                  onClick={activeNote ? updateNote : createNewNote}
                >
                  Save
                </button>
              </div>
            </div>
          )}
          
          {viewMode === 'view' && activeNote && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">{activeNote.title}</h2>
                <div className="flex gap-2">
                  <button
                    className="bg-blue-500 text-white px-3 py-1 rounded"
                    onClick={editNote}
                  >
                    Edit
                  </button>
                  <button
                    className="bg-red-500 text-white px-3 py-1 rounded"
                    onClick={() => deleteNote(activeNote.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              
              <div className="text-gray-500 text-sm mb-4">
                Created: {new Date(activeNote.createdAt).toLocaleString()}<br />
                Updated: {new Date(activeNote.updatedAt).toLocaleString()}
              </div>
              
              <div className="mb-4 flex flex-wrap gap-1">
                {activeNote.tags.map(tag => (
                  <span key={tag} className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    #{tag}
                  </span>
                ))}
              </div>
              
              <div className="prose border-t pt-4">
                {renderNoteContent()}
              </div>
              
              {activeNote.links.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium mb-2">Links</h3>
                  <ul className="flex flex-wrap gap-2">
                    {activeNote.links.map(link => {
                      const linkedNote = notes.find(note => note.title === link);
                      return (
                        <li 
                          key={link}
                          className={`cursor-pointer px-2 py-1 rounded ${
                            linkedNote ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                          onClick={() => handleLinkClick(link)}
                        >
                          {link}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
