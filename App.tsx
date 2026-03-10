import React, { useState, useEffect } from 'react';
import LoggerInterface from './components/ChatInterface';
import { StorageService } from './services/storageService';
import { UserSession } from './types';
import { Terminal, Key, User, ArrowRight, Bot, Trash2, Plus, ArrowLeft } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  
  // Login Form States
  const [tokenInput, setTokenInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');

  useEffect(() => {
    const storedUser = StorageService.getUser();
    const storedSessions = StorageService.getSessions();
    setSessions(storedSessions);
    if (storedUser) setUser(storedUser);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenInput && usernameInput) {
      const session = StorageService.login(tokenInput, usernameInput, usernameInput);
      setUser(session);
      setSessions(StorageService.getSessions());
      setIsAddingNew(false);
      setTokenInput('');
      setUsernameInput('');
    }
  };

  const handleSelectSession = (session: UserSession) => {
    StorageService.selectSession(session.id);
    setUser(session);
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    StorageService.logout(id);
    setSessions(StorageService.getSessions());
    if (user?.id === id) setUser(null);
  };

  const handleLogout = () => {
    StorageService.logout();
    setUser(null);
  };

  if (user) {
    return <LoggerInterface user={user} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-6 font-mono selection:bg-green-500/30">
      <div className="w-full max-w-lg">
        {!isAddingNew && sessions.length > 0 ? (
          <div className="space-y-6">
             <div className="text-center mb-8">
                <Terminal size={48} className="text-green-500 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-gray-100">Bot Manager</h1>
                <p className="text-gray-500 text-sm mt-1">Select an active bot session</p>
             </div>

             <div className="grid grid-cols-1 gap-3">
                {sessions.map((s) => (
                  <div 
                    key={s.id}
                    onClick={() => handleSelectSession(s)}
                    className="group bg-[#161b22] border border-gray-800 p-4 rounded-xl flex items-center justify-between cursor-pointer hover:border-green-500/50 hover:bg-[#1c242d] transition-all"
                  >
                    <div className="flex items-center gap-4">
                       <div className="w-10 h-10 bg-green-900/20 rounded-full flex items-center justify-center border border-green-500/20">
                          <Bot size={20} className="text-green-500" />
                       </div>
                       <div>
                          <p className="font-bold text-gray-200">{s.botName}</p>
                          <p className="text-[10px] text-gray-500 font-mono truncate w-40">{s.token.slice(0, 15)}...</p>
                       </div>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      className="p-2 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}

                <button 
                  onClick={() => setIsAddingNew(true)}
                  className="mt-4 flex items-center justify-center gap-2 border-2 border-dashed border-gray-800 p-4 rounded-xl text-gray-500 hover:border-green-500/30 hover:text-green-500 transition-all"
                >
                  <Plus size={20} /> Add New Bot
                </button>
             </div>
          </div>
        ) : (
          <div className="bg-[#161b22] p-8 rounded-2xl border border-gray-800 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 via-blue-500 to-purple-500"></div>
            
            <div className="flex items-center justify-between mb-8">
               {sessions.length > 0 && (
                 <button onClick={() => setIsAddingNew(false)} className="text-gray-500 hover:text-white flex items-center gap-1 text-xs">
                    <ArrowLeft size={14} /> Back
                 </button>
               )}
               <Terminal size={24} className="text-green-500 mx-auto" />
               <div className="w-10"></div>
            </div>

            <h2 className="text-xl font-bold text-center text-gray-200 mb-2">Connect New Bot</h2>
            <p className="text-gray-500 text-center mb-8 text-xs leading-relaxed">
              Token is required to interact with Telegram API.<br/>
              Get it from <a href="https://t.me/BotFather" target="_blank" className="text-blue-400 hover:underline">@BotFather</a>.
            </p>
            
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative group">
                <User className="absolute left-3 top-3.5 text-gray-600 group-focus-within:text-green-500 transition" size={16} />
                <input 
                  type="text" 
                  placeholder="Internal Name (e.g. My AI Bot)" 
                  className="w-full bg-[#0d1117] text-gray-300 border border-gray-700 rounded-xl px-10 py-3.5 text-sm focus:outline-none focus:border-green-500 transition"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  required
                />
              </div>

              <div className="relative group">
                <Key className="absolute left-3 top-3.5 text-gray-600 group-focus-within:text-green-500 transition" size={16} />
                <input 
                  type="password" 
                  placeholder="API Token (123456:ABC...)" 
                  className="w-full bg-[#0d1117] text-gray-300 border border-gray-700 rounded-xl px-10 py-3.5 text-sm focus:outline-none focus:border-green-500 transition"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  required
                />
              </div>

              <button 
                type="submit" 
                className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 mt-6 uppercase tracking-widest shadow-lg shadow-green-900/20 active:scale-[0.98]"
              >
                Launch Console <ArrowRight size={16} />
              </button>
            </form>
            
            <div className="mt-8 text-center text-[10px] text-gray-600 border-t border-gray-800 pt-6">
              SECURE CLIENT-SIDE POLLING. NO DATA LEAVES YOUR BROWSER.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;