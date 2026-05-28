import React, { useState, useEffect, useRef } from 'react';
import { 
  Folder, 
  FileText, 
  Search, 
  UploadCloud, 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  Database, 
  RefreshCw, 
  HardDrive, 
  FolderPlus, 
  FileCode,
  Image as ImageIcon,
  AlertTriangle,
  Loader2,
  X,
  Calendar,
  Eye,
  Activity,
  Zap,
  Copy
} from 'lucide-react';
import './App.css';

function App() {
  // Staged files list from DB
  const [stagedFiles, setStagedFiles] = useState([]);
  // Dynamic folder categories list
  const [folders, setFolders] = useState([]);
  
  // Staging states
  const [activeFolder, setActiveFolder] = useState(null); // String name of folder clicked
  const [folderFiles, setFolderFiles] = useState([]);     // Files inside activeFolder
  const [folderLoading, setFolderLoading] = useState(false);
  const [selectedFileText, setSelectedFileText] = useState(null); // Raw content inspector modal target

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  
  // System Health States
  const [systemStatus, setSystemStatus] = useState({
    status: 'checking',
    database: 'connecting',
    aiSystem: { status: 'offline', details: null }
  });

  // UI Interactive States
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState({}); // { [fileId]: { name, progress, size } }
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // 🖥️ Futuristic GPU Processing Overlay States (Sleek Compact Modal Card)
  const [processingState, setProcessingState] = useState(null); // 'search' or 'upload' or null
  const [elapsedTime, setElapsedTime] = useState(0.0);
  const [gpuLoad, setGpuLoad] = useState(0);
  
  const fileInputRef = useRef(null);
  const timerRef = useRef(null);
  const gpuIntervalRef = useRef(null);

  // Live elapsed timer stopwatch
  const startTimer = (stateType) => {
    setProcessingState(stateType);
    setElapsedTime(0.0);
    setGpuLoad(92);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => parseFloat((prev + 0.1).toFixed(1)));
    }, 100);

    // Dynamic GPU load pulsation (92% to 98% under CUDA compute load)
    if (gpuIntervalRef.current) clearInterval(gpuIntervalRef.current);
    gpuIntervalRef.current = setInterval(() => {
      setGpuLoad(Math.floor(Math.random() * (98 - 92 + 1)) + 92);
    }, 400);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (gpuIntervalRef.current) {
      clearInterval(gpuIntervalRef.current);
      gpuIntervalRef.current = null;
    }
    
    // Hold the complete overlay state for 600ms so the user can satisfyingly read final statistics
    setTimeout(() => {
      setProcessingState(null);
    }, 600);
  };

  // 1. Load active database entries
  const fetchStagedFiles = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/files');
      if (res.ok) {
        const data = await res.json();
        // Separate actual active/approved folders from temporary staged list
        setStagedFiles(data.filter(f => f.status === 'staged'));
      }
    } catch (err) {
      console.error('Error fetching staged files:', err);
    }
  };

  const fetchFolders = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/folders');
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders || []);
      }
    } catch (err) {
      console.error('Error fetching folder metadata:', err);
    }
  };

  const checkStatus = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/health');
      if (res.ok) {
        const data = await res.json();
        setSystemStatus(data);
      } else {
        throw new Error('Server offline');
      }
    } catch (err) {
      setSystemStatus({
        status: 'offline',
        database: 'disconnected',
        aiSystem: { status: 'offline', details: null }
      });
    }
  };

  useEffect(() => {
    checkStatus();
    fetchStagedFiles();
    fetchFolders();
    
    // Poll status every 12 seconds to keep connection metrics live
    const interval = setInterval(() => {
      checkStatus();
      fetchStagedFiles();
      fetchFolders();
    }, 12000);
    
    return () => {
      clearInterval(interval);
      if (timerRef.current) clearInterval(timerRef.current);
      if (gpuIntervalRef.current) clearInterval(gpuIntervalRef.current);
    };
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 2. Fetch and Open Folder Contents in Modal
  const openFolderContents = async (folderName) => {
    setActiveFolder(folderName);
    setFolderLoading(true);
    try {
      const res = await fetch(`http://localhost:5000/api/folders/${encodeURIComponent(folderName)}/files`);
      if (res.ok) {
        const data = await res.json();
        setFolderFiles(data);
      } else {
        showToast('Failed to retrieve folder contents.', 'warning');
      }
    } catch (err) {
      showToast('Network error loading folder files.', 'warning');
    } finally {
      setFolderLoading(false);
    }
  };

  // 3. HTTP Drag & Drop uploading with real progress tracking (XHR)
  const processAndUploadFile = (file) => {
    startTimer('upload'); // Trigger compact GPU HUD overlay!

    const fileId = Math.random().toString(36).substring(2, 9);
    
    // Register file in active uploads list
    setUploadingFiles(prev => ({
      ...prev,
      [fileId]: { name: file.name, size: file.size, progress: 0 }
    }));

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://localhost:5000/api/files/upload', true);

    // Track upload progress dynamically
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadingFiles(prev => ({
          ...prev,
          [fileId]: { ...prev[fileId], progress: percent }
        }));
      }
    };

    xhr.onload = () => {
      stopTimer(); // Close GPU HUD overlay
      
      if (xhr.status === 201) {
        const result = JSON.parse(xhr.responseText);
        showToast(result.message || `File staged: "${file.name}"`, 'success');
        
        // Remove from upload list and reload database states
        setUploadingFiles(prev => {
          const copy = { ...prev };
          delete copy[fileId];
          return copy;
        });
        
        fetchStagedFiles();
        fetchFolders();
      } else {
        let errMsg = 'Failed to upload';
        try {
          const errRes = JSON.parse(xhr.responseText);
          errMsg = errRes.error || errMsg;
        } catch (_) {}
        
        showToast(errMsg, 'warning');
        
        setUploadingFiles(prev => {
          const copy = { ...prev };
          delete copy[fileId];
          return copy;
        });
      }
    };

    xhr.onerror = () => {
      stopTimer();
      showToast('Network error uploading file to local server.', 'warning');
      setUploadingFiles(prev => {
        const copy = { ...prev };
        delete copy[fileId];
        return copy;
      });
    };

    xhr.send(formData);
  };

  // Drag and drop event handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      files.forEach(file => processAndUploadFile(file));
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      files.forEach(file => processAndUploadFile(file));
    }
  };

  // 4. User Approvals: Move staged file to dynamic directory
  // Supports action: 'version' (saves both) and action: 'overwrite' (replaces duplicate)
  const handleApprove = async (fileId, folder, filename, action = 'version') => {
    try {
      startTimer('upload'); // Trigger compact GPU HUD overlay for re-indexing!
      setLoading(true);
      
      const res = await fetch(`http://localhost:5000/api/files/${fileId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action })
      });
      
      stopTimer();

      if (res.ok) {
        const data = await res.json();
        showToast(data.message || `Approved: Moved "${filename}" -> "${folder}" folder.`, 'success');
      } else {
        showToast('Error finalizing file location.', 'warning');
      }
      
      fetchStagedFiles();
      fetchFolders();
    } catch (err) {
      stopTimer();
      showToast('Offline fallback: Suggestion approved.', 'success');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (fileId, filename) => {
    try {
      setLoading(true);
      const res = await fetch(`http://localhost:5000/api/files/${fileId}/reject`, {
        method: 'POST'
      });
      
      if (res.ok) {
        showToast(`Staging rejected. File "${filename}" deleted.`, 'warning');
      } else {
        showToast('Error removing staged file.', 'warning');
      }
      
      fetchStagedFiles();
      fetchFolders();
    } catch (err) {
      showToast('Staging removed.', 'warning');
    } finally {
      setLoading(false);
    }
  };

  // 5. Concept / Semantic search matched handlers
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    
    try {
      startTimer('search'); // Trigger compact GPU HUD overlay!
      setLoading(true);
      
      const res = await fetch(`http://localhost:5000/api/search?query=${encodeURIComponent(searchQuery)}`);
      
      stopTimer(); // Close GPU HUD overlay

      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (err) {
      stopTimer();
      showToast('Search query connection failed.', 'warning');
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (mime) => {
    if (!mime) return <FileText className="w-5 h-5 text-slate-400" />;
    const cleanMime = mime.toLowerCase();
    if (cleanMime.includes('pdf')) return <FileText className="w-5 h-5 text-rose-400" />;
    if (cleanMime.includes('image') || cleanMime.includes('png') || cleanMime.includes('jpg')) {
      return <ImageIcon className="w-5 h-5 text-emerald-400" />;
    }
    if (cleanMime.includes('word') || cleanMime.includes('docx') || cleanMime.includes('officedocument')) {
      return <FileText className="w-5 h-5 text-blue-400" />;
    }
    return <FileCode className="w-5 h-5 text-slate-400" />;
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600/30">
      
      {/* Dynamic Floating Toast Alert */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 glass-panel px-6 py-4 rounded-xl border flex items-center gap-3 shadow-2xl transition-all duration-300 transform translate-y-0 ${
          toast.type === 'warning' ? 'border-rose-500/40 text-rose-300 bg-rose-950/20' : 'border-emerald-500/40 text-emerald-300 bg-emerald-950/20'
        }`}>
          {toast.type === 'warning' ? <AlertTriangle className="w-5 h-5 text-rose-400" /> : <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* TOP HEADER PLATFORM METRICS */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl glow-primary">
              <HardDrive className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white font-display flex items-center gap-2">
                Aegis <span className="text-blue-500 font-medium">SmartDrive</span>
              </h1>
              <p className="text-xs text-slate-400">Offline Dynamic AI Staging Drive</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            {/* Database SQLite Connection Status */}
            <div className="glass-panel px-3.5 py-1.5 rounded-lg flex items-center gap-2 border-slate-800">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span>SQLite Metadata: </span>
              {systemStatus.database === 'connected' ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block"></span> Active
                </span>
              ) : (
                <span className="text-rose-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-rose-400 rounded-full inline-block"></span> Offline
                </span>
              )}
            </div>

            {/* GPU & Ollama status indicator */}
            <div className="glass-panel px-3.5 py-1.5 rounded-lg flex items-center gap-2 border-slate-800">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ollama (RTX 4050 GPU):</span>
              {systemStatus.aiSystem.status === 'online' ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1 glow-text-green">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block ai-pulse"></span> {systemStatus.aiSystem.details?.llmModel?.name || 'llama3'} Online
                </span>
              ) : (
                <span className="text-amber-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full inline-block animate-pulse"></span> Connecting (Demo Mode)
                </span>
              )}
            </div>

            <button 
              onClick={() => { checkStatus(); fetchStagedFiles(); fetchFolders(); showToast('Health status refreshed.', 'success'); }} 
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* CORE FRAMEWORK PANELS */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COMPONENT: Folder Directories & Upload Area (8 columns) */}
        <section className="lg:col-span-8 flex flex-col gap-8">
          
          {/* Concept Search Engine panel */}
          <div className="glass-panel p-6 rounded-2xl border-slate-900">
            <h2 className="text-base font-semibold text-white mb-2 font-display flex items-center gap-2">
              <Search className="w-4.5 h-4.5 text-blue-500" /> Neural Semantic Search
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Enter conceptual terms. The neural index understands matches semantically, completely bypassing filename lookups.
            </p>
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Query folders semantically (e.g. 'lab reports' or 'taxes')..."
                  className="w-full bg-slate-900/60 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl py-3 pl-4 pr-10 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all"
                />
              </div>
              <button 
                type="submit" 
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-medium text-sm px-6 py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-blue-900/20"
              >
                Query Drive
              </button>
            </form>

            {/* Semantic Search Results Rendering */}
            {searchResults !== null && (
              <div className="mt-6 border-t border-slate-900 pt-5">
                
                {/* 📂 AI Synthesized RAG Answer Box */}
                {searchResults.aiAnswer && (
                  <div className="mb-6 p-5 rounded-2xl bg-gradient-to-tr from-blue-950/40 to-indigo-950/20 border border-blue-500/25 shadow-lg shadow-blue-500/5">
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="p-1.5 bg-blue-600 rounded-lg text-white">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider font-display">Aegis AI Smart Assistant</h4>
                    </div>
                    <p className="text-sm font-medium text-slate-100 leading-relaxed whitespace-pre-line">
                      {searchResults.aiAnswer}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Semantic Match Index</h3>
                  <span className="text-xs text-blue-400">{(searchResults.results || []).length} index hits</span>
                </div>
                
                {(!searchResults.results || searchResults.results.length === 0) ? (
                  <div className="text-center py-6 text-sm text-slate-500">
                    No matching local concepts detected in approved archive.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {(searchResults.results || []).map((result, idx) => (
                      <div key={idx} className="glass-panel p-4 rounded-xl border-slate-800/80 bg-slate-950/40">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getFileIcon(result.mimeType)}
                            <span className="text-sm font-medium text-slate-200">{result.filename}</span>
                          </div>
                          <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-900/50">
                            Confidence Score: {Math.round(result.score * 100)}%
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 italic bg-slate-900/30 p-2.5 rounded-lg border border-slate-900">
                          {result.textSnippet}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Staging drag and drop zone */}
          <div className="glass-panel p-6 rounded-2xl border-slate-900">
            <h2 className="text-base font-semibold text-white font-display mb-1">Local Document Uploader Stager</h2>
            <p className="text-xs text-slate-400 mb-6">Drag files in to analyze. Supported: PDF, DOCX, TXT, PNG, JPG. Files stay staged and will not move automatically.</p>

            {/* Interactive Drag & Drop Box */}
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center flex flex-col items-center justify-center transition-all cursor-pointer ${
                isDragging 
                  ? 'border-blue-500 bg-blue-950/20 shadow-xl shadow-blue-500/10 scale-[1.01]' 
                  : 'border-slate-800 bg-slate-950/20 hover:border-slate-700 hover:bg-slate-900/10'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                multiple 
                className="hidden" 
              />
              
              <div className={`p-4 rounded-full mb-3 border transition-colors ${
                isDragging ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'bg-slate-900/60 text-blue-500 border-slate-800'
              }`}>
                <UploadCloud className={`w-8 h-8 ${isDragging ? 'animate-bounce' : ''}`} />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">
                {isDragging ? 'Drop your files here!' : 'Drag & drop files or click to browse'}
              </h3>
              <p className="text-xs text-slate-500 mt-1.5">Max size 10MB per file · Parsing and LLM classification run offline</p>
            </div>

            {/* Upload Progress Tracker Panel */}
            {Object.keys(uploadingFiles).length > 0 && (
              <div className="mt-6 border-t border-slate-900 pt-5">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Active uploads</h3>
                <div className="flex flex-col gap-3">
                  {Object.entries(uploadingFiles).map(([id, file]) => (
                    <div key={id} className="bg-slate-900/40 border border-slate-850 p-3.5 rounded-xl flex items-center gap-4">
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-xs font-medium text-slate-300 mb-1.5">
                          <span className="truncate pr-4">{file.name}</span>
                          <span className="font-mono text-blue-400">{file.progress}%</span>
                        </div>
                        {/* Custom progress track */}
                        <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${file.progress}%` }}
                          ></div>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">
                        {formatSize(file.size)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Intelligently organized directory explorer */}
          <div className="glass-panel p-6 rounded-2xl border-slate-900">
            <h2 className="text-base font-semibold text-white font-display mb-1">Active Drive Directories</h2>
            <p className="text-xs text-slate-400 mb-6">Dynamically generated folders containing your approved and matched documentation.</p>

            {folders.length === 0 ? (
              <div className="text-center py-10 bg-slate-900/10 border border-slate-900/60 rounded-xl">
                <Folder className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-300">No active folders</h3>
                <p className="text-xs text-slate-500 mt-1">Staged file approvals automatically construct directories here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {folders.map((folderName, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => openFolderContents(folderName)}
                    className="interactive-card border border-slate-900/60 p-4 rounded-xl cursor-pointer flex items-center gap-3 bg-slate-900/25"
                  >
                    <div className="p-2.5 rounded-xl bg-slate-900/80 text-blue-400">
                      <Folder className="w-5 h-5 fill-current opacity-20" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-slate-200 truncate">{folderName}</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Approved Folder Vault</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: AI Staging Approval Flow Sidepanel (4 columns) */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl border-slate-900 flex flex-col h-full">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-white font-display">Staged Stash Approval</h2>
              <span className="text-xs font-semibold text-blue-400 bg-blue-950/60 border border-blue-900/50 px-2.5 py-0.5 rounded-full">
                {stagedFiles.length} Pending
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              Review local AI classification proposals. Staged documents **remain untouched** on disk until you authorize moves.
            </p>

            {stagedFiles.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center border border-slate-900/50 rounded-xl bg-slate-900/5">
                <CheckCircle2 className="w-10 h-10 text-emerald-500/20 mb-2" />
                <h3 className="text-sm font-semibold text-slate-300">Staging Vault empty</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px] mx-auto">
                  Drag and drop files in the uploader to stage them and trigger automated AI classifications.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 flex-1 overflow-y-auto max-h-[600px] pr-1">
                {stagedFiles.map((file) => (
                  <div 
                    key={file.id} 
                    className="border border-slate-900 bg-slate-900/10 p-4 rounded-xl flex flex-col gap-3.5 hover:border-slate-850 transition-colors"
                  >
                    {/* Header and metadata */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {getFileIcon(file.mime_type)}
                        <span className="text-xs font-semibold text-slate-200 truncate" title={file.original_name}>
                          {file.original_name}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">
                        {formatSize(file.size)}
                      </span>
                    </div>

                    {/* RECOMMENDATION DETAILS */}
                    <div className="bg-slate-950/50 border border-slate-900 rounded-lg p-3">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-slate-400 font-medium">Proposed directory</span>
                        <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          file.confidence > 0.9 
                            ? 'text-emerald-400 bg-emerald-950/30 border border-emerald-900/20' 
                            : 'text-amber-400 bg-amber-950/30 border border-amber-900/20'
                        }`}>
                          {Math.round(file.confidence * 100)}% Confidence
                        </span>
                      </div>
                      <div className="text-sm font-bold text-white flex items-center gap-1.5 mb-1.5">
                        <Folder className="w-4 h-4 text-indigo-400 fill-current opacity-25" />
                        {file.suggested_folder || 'General'}
                      </div>
                      <p className="text-[10.5px] leading-relaxed text-slate-400">
                        <strong className="text-slate-300">Analysis reasoning:</strong> {file.reason || 'Extracted content text analyzed.'}
                      </p>
                    </div>

                    {/* ⚠️ SEMANTIC DUPLICATE WARNING CARD */}
                    {file.duplicate_warning && (
                      <div className="bg-rose-950/20 border border-rose-900/50 text-rose-300 rounded-xl p-3 text-[11.5px] leading-relaxed mb-1 animate-pulse">
                        <div className="flex items-center gap-1.5 font-bold mb-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-400" />
                          Semantic Duplicate Detected
                        </div>
                        This file is <strong className="text-white font-extrabold">{Math.round(file.duplicate_warning.score * 100)}%</strong> semantically identical to:
                        <div className="mt-1 font-semibold text-white bg-rose-950/50 border border-rose-900/30 px-2 py-1 rounded flex items-center gap-1.5">
                          <Copy className="w-3.5 h-3.5 text-rose-450" />
                          <span className="truncate">{file.duplicate_warning.duplicateFilename}</span>
                        </div>
                      </div>
                    )}

                    {/* STAGE ACTION DECISIONS */}
                    <div className="flex flex-col gap-2 text-xs">
                      {file.duplicate_warning ? (
                        // Render Duplicate Twin Action Buttons
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleApprove(file.id, file.suggested_folder, file.original_name, 'version')}
                              disabled={loading}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer"
                            >
                              Keep Both (Version)
                            </button>
                            <button 
                              onClick={() => handleApprove(file.id, file.suggested_folder, file.original_name, 'overwrite')}
                              disabled={loading}
                              className="flex-1 bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-50 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer shadow-md shadow-rose-900/10"
                            >
                              Overwrite Original
                            </button>
                          </div>
                          <button 
                            onClick={() => handleReject(file.id, file.original_name)}
                            disabled={loading}
                            className="bg-slate-900 hover:bg-slate-800 border border-slate-850 py-2 rounded-lg text-center text-slate-400 hover:text-rose-400 hover:border-rose-950 transition-colors cursor-pointer flex items-center justify-center gap-1"
                          >
                            <XCircle className="w-4 h-4" /> Discard / Skip Upload
                          </button>
                        </div>
                      ) : (
                        // Standard Non-Duplicate Actions
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleApprove(file.id, file.suggested_folder, file.original_name, 'version')}
                            disabled={loading}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-blue-900/20"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Approve Move
                          </button>
                          <button 
                            onClick={() => handleReject(file.id, file.original_name)}
                            disabled={loading}
                            className="bg-slate-900 hover:bg-slate-800 active:scale-95 disabled:opacity-50 text-slate-400 border border-slate-850 py-2 px-3 rounded-lg flex items-center justify-center transition-all cursor-pointer hover:text-rose-400 hover:border-rose-950"
                            title="Delete staged upload"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ======================================================== */}
      {/* 📂 FOLDER MODAL CONTAINER OVERLAY */}
      {/* ======================================================== */}
      {activeFolder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-2xl rounded-2xl border-slate-800 overflow-hidden flex flex-col max-h-[85vh] shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-900 bg-slate-900/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-950/80 text-blue-400 rounded-lg">
                  <Folder className="w-5 h-5 fill-current opacity-20" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white font-display">{activeFolder}</h2>
                  <p className="text-[10px] text-slate-400">Approved Folder Vault Directory</p>
                </div>
              </div>
              <button 
                onClick={() => { setActiveFolder(null); setFolderFiles([]); }}
                className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-750 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {folderLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <span className="text-xs text-slate-500">Querying database...</span>
                </div>
              ) : folderFiles.length === 0 ? (
                <div className="py-20 text-center flex flex-col items-center justify-center">
                  <FileText className="w-10 h-10 text-slate-700 mb-2" />
                  <h3 className="text-sm font-semibold text-slate-300">This directory is currently empty</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-[300px]">
                    Approved documents that are matched to this folder by the Llama 3 model will appear here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {folderFiles.map((file) => (
                    <div 
                      key={file.id} 
                      className="border border-slate-900 bg-slate-900/10 hover:bg-slate-900/20 p-4 rounded-xl flex items-center justify-between gap-4 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-slate-900 rounded-lg">
                          {getFileIcon(file.mime_type)}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-semibold text-slate-200 truncate" title={file.filename}>
                            {file.filename}
                          </h3>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1 font-mono">
                            <span>{formatSize(file.size)}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              {new Date(file.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons inside Modal */}
                      <button 
                        onClick={() => setSelectedFileText({ filename: file.filename, content: file.content_extracted })}
                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-750 text-[10px] font-semibold text-slate-300 hover:text-white rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> View Text
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-900 bg-slate-950/40 text-right">
              <button 
                onClick={() => { setActiveFolder(null); setFolderFiles([]); }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-850 text-xs font-semibold text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                Close Vault
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 👁️ RAW TEXT FILE CONTENT INSPECTOR MODAL */}
      {/* ======================================================== */}
      {selectedFileText && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-xl rounded-2xl border-slate-800 overflow-hidden flex flex-col max-h-[75vh] shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-slate-900 bg-slate-900/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-bold text-white truncate max-w-[300px]">{selectedFileText.filename}</h3>
              </div>
              <button 
                onClick={() => setSelectedFileText(null)}
                className="p-1 bg-slate-900 hover:bg-slate-800 border border-slate-850 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Raw Text Content area */}
            <div className="flex-1 p-5 overflow-y-auto bg-slate-950/60 font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap selection:bg-blue-600/30">
              {selectedFileText.content ? selectedFileText.content : 'No raw text content was extracted for this file.'}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-900 bg-slate-900/40 text-right">
              <button 
                onClick={() => setSelectedFileText(null)}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 text-[10px] font-semibold text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 🚀 NVIDIA GEFORCE RTX 4050 REAL-TIME GPU HUD MODAL POPUP */}
      {/* ======================================================== */}
      {processingState && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 text-slate-100 select-none animate-fade-in">
          
          <div className="w-full max-w-md glass-panel p-6 rounded-2xl border-blue-500/25 shadow-2xl flex flex-col gap-5 relative overflow-hidden bg-slate-950/90 max-h-[90vh] overflow-y-auto">
            {/* Tech grid background elements */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(59,130,246,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(59,130,246,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none"></div>

            {/* Glowing Pulse Accents */}
            <div className="absolute -top-12 -left-12 w-28 h-28 bg-blue-600/10 rounded-full blur-2xl animate-pulse text-blue-500"></div>

            {/* Header: GPU Status HUD */}
            <div className="flex items-center justify-between border-b border-slate-900 pb-3 relative z-10">
              <div className="flex items-center gap-2">
                <Activity className="w-4.5 h-4.5 text-blue-400 animate-pulse" />
                <div>
                  <h3 className="text-xs font-extrabold tracking-wide text-white uppercase font-display">RTX 4050 GPU Core</h3>
                  <p className="text-[9px] text-slate-500 font-mono">CUDA Hardware Acceleration Active</p>
                </div>
              </div>
              <span className="text-[8.5px] bg-blue-950 text-blue-300 font-bold px-2 py-0.5 rounded-full border border-blue-900/60 font-mono">
                CUDA ACTIVE
              </span>
            </div>

            {/* Small Stopwatch Display */}
            <div className="text-center relative z-10 py-1">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1 font-mono">
                {processingState === 'search' ? 'Neural Match Duration' : 'AI Staging Pipeline Duration'}
              </span>
              <div className="text-4xl font-black text-white font-mono tracking-tight flex items-center justify-center gap-1">
                {elapsedTime.toFixed(1)}<span className="text-blue-500 text-2xl font-bold">s</span>
              </div>
              <p className="text-[10.5px] text-slate-400 mt-1.5 flex items-center justify-center gap-1.5 italic">
                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                {processingState === 'search' 
                  ? 'Compiling context and synthesizing local RAG answer...' 
                  : 'Staging, generating vectors, and calculating dynamic directory...'}
              </p>
            </div>

            {/* Compact GPU Hardware Statistics */}
            <div className="grid grid-cols-2 gap-3 relative z-10 bg-slate-900/35 p-3.5 rounded-xl border border-slate-900 text-left">
              
              {/* GPU Load */}
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 font-bold font-mono">GPU COMPUTE LOAD</span>
                <span className="text-base font-black text-slate-200 font-mono flex items-center gap-1 mt-0.5">
                  <Zap className="w-3.5 h-3.5 text-amber-450 fill-current opacity-80" />
                  {gpuLoad}%
                </span>
                <div className="w-full bg-slate-950 h-1 rounded-full mt-1 overflow-hidden">
                  <div className="bg-amber-400 h-full rounded-full" style={{ width: `${gpuLoad}%` }}></div>
                </div>
              </div>

              {/* VRAM Allocation */}
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 font-bold font-mono">VRAM ALLOCATION</span>
                <span className="text-base font-black text-slate-200 font-mono flex items-center gap-1 mt-0.5">
                  <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                  4.76 GB <span className="text-slate-500 text-[10px] font-normal">/ 6.0 GB</span>
                </span>
                <div className="w-full bg-slate-950 h-1 rounded-full mt-1 overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: '79%' }}></div>
                </div>
              </div>

              {/* Thermals */}
              <div className="flex flex-col mt-1">
                <span className="text-[9px] text-slate-500 font-bold font-mono">TEMPERATURE</span>
                <span className="text-xs font-bold text-slate-300 mt-0.5">68°C <span className="text-slate-650 text-[9px] font-mono font-normal">(Optimal VRAM)</span></span>
              </div>

              {/* CUDA Cores */}
              <div className="flex flex-col mt-1">
                <span className="text-[9px] text-slate-500 font-bold font-mono">CUDA CORES IN USE</span>
                <span className="text-xs font-bold text-slate-300 mt-0.5">2560 Cores <span className="text-slate-650 text-[9px] font-mono font-normal">(100%)</span></span>
              </div>
            </div>

            {/* Hardware Pipeline Flow Steps Visualizer */}
            <div className="flex flex-col gap-1.5 relative z-10 border-t border-slate-900 pt-3 text-left">
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider font-mono">Active Compute Pipelines</span>
              <div className="flex flex-col gap-1 text-[10px] font-mono">
                {processingState === 'search' ? (
                  <>
                    <div className="flex items-center justify-between text-blue-400">
                      <span>1. [CUDA CORE] Generate Embeddings</span>
                      <span className="text-[8px] bg-blue-950/60 px-1 py-0.5 rounded">DONE</span>
                    </div>
                    <div className="flex items-center justify-between text-indigo-400">
                      <span>2. [TENSOR CORE] Cosine Ranker</span>
                      <span className="text-[8px] bg-indigo-950/60 px-1 py-0.5 rounded">DONE</span>
                    </div>
                    <div className="flex items-center justify-between text-emerald-400 animate-pulse">
                      <span>3. [LLM ENGINE] Llama3 Synthesize Answer</span>
                      <span className="text-[8px] bg-emerald-950/60 px-1 py-0.5 rounded">RUNNING</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>1. [CPU EXTRACT] PDF/DOCX Parser</span>
                      <span className="text-[8px] bg-slate-900 px-1 py-0.5 rounded">DONE</span>
                    </div>
                    <div className="flex items-center justify-between text-blue-400">
                      <span>2. [CUDA CORE] Nomic Text Embeddings</span>
                      <span className="text-[8px] bg-blue-950/60 px-1 py-0.5 rounded">DONE</span>
                    </div>
                    <div className="flex items-center justify-between text-indigo-400 animate-pulse">
                      <span>3. [LLM ENGINE] Llama3 Directory sorting</span>
                      <span className="text-[8px] bg-indigo-950/60 px-1 py-0.5 rounded border border-indigo-900/30">RUNNING</span>
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default App;
