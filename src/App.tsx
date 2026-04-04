import { useEffect, useMemo, useState, useRef } from 'react';
import './styles.css';

type Sender = 'user' | 'assistant';
type MessageType = 'prompt' | 'clarification' | 'result' | 'note';

interface ChatMessage {
  id: string;
  sender: Sender;
  content: string;
  timestamp: string;
  type: MessageType;
}

interface Project {
  id: string;
  name: string;
  description: string;
  chats: ChatMessage[];
}

interface UserData {
  username: string;
  projects: Project[];
}

const STORAGE_KEY = 'vibe-prompt-users';

const SYSTEM_PROMPT = `You are a prompt engineering assistant. Your goal is to help the user refine their coding task description into an optimal, highly detailed prompt for an AI coding assistant.
If their request is vague or missing context (like language, framework, expected output format, or specific details), ask short, insightful clarification questions.
Once you have enough context, output the finalized prompt by starting your response EXACTLY with "FINAL_PROMPT:\n" followed by the clear, concise prompt. You can also output the final prompt immediately if their initial request is already good enough. Do not be overly conversational.`;

const PROMPT_TEMPLATES: Record<string, { label: string, template: (task: string) => string }> = {
  RACE: {
    label: 'RACE: Role, Action, Context, Expectation',
    template: (task) => `Role: Define who is responsible or who should execute this task.\nAction: Describe the specific action to be taken.\nContext: Share the relevant background or environment.\nExpectation: State the intended outcome clearly.\n\n${task}`
  },
  CARE: {
    label: 'CARE: Context, Action, Result, Example',
    template: (task) => `Context: Explain the current situation and constraints.\nAction: Describe the work that should be done.\nResult: Highlight the desired success criteria.\nExample: Provide an example to show what success looks like.\n\n${task}`
  },
  RTF: {
    label: 'RTF: Role-Task-Format',
    template: (task) => `Role: Define the role or persona for this task.\nTask: Specify the work to perform.\nFormat: Describe the output format or structure required.\n\n${task}`
  },
  RISEN: {
    label: 'RISEN: Role, Instructions, Steps, End Goal, Narrowing',
    template: (task) => `Role: Define the role or perspective.\nInstructions: Provide clear instructions and boundaries.\nSteps: Outline the necessary steps to complete the task.\nEnd Goal: Define the final objective.\nNarrowing: Specify constraints or narrow the focus.\n\n${task}`
  },
  CLEAR: {
    label: 'CLEAR: Context, Logic, Expectations, Action, Restrictions',
    template: (task) => `Context: Describe the situation and background.\nLogic: Explain the reasoning behind the task.\nExpectations: Define the expected outcomes.\nAction: Describe what should be done.\nRestrictions: List any constraints or rules.\n\n${task}`
  }
};

function uuid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function loadUsers(): Record<string, UserData> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, UserData>;
  } catch {
    return {};
  }
}

function saveUsers(users: Record<string, UserData>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = (apiKey: string) => `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

function extractGeminiResponse(data: any): string {
  const candidate = data?.candidates?.[0];
  if (!candidate) return '';

  const tryText = (value: any): string | null => {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return null;
  };

  // Try direct output
  const directOutput = tryText(candidate?.output);
  if (directOutput) return directOutput;

  // Try content array
  const contentItems = Array.isArray(candidate?.content) ? candidate.content : [];
  for (const item of contentItems) {
    const foundText = tryText(item?.text) ||
      (Array.isArray(item?.parts) ? item.parts.map((part: any) => tryText(part?.text)).find(Boolean) : null);
    if (foundText) return foundText;
  }

  // Try legacy structure
  const legacyText = tryText(data?.candidates?.[0]?.content?.parts?.[0]?.text);
  if (legacyText) return legacyText;

  // Fallback: return raw data for debugging
  console.log('Gemini response structure:', JSON.stringify(data, null, 2));
  return JSON.stringify(data, null, 2);
}

export default function App() {
  const [usernameInput, setUsernameInput] = useState('');
  const [username, setUsername] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [promptText, setPromptText] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [promptStatus, setPromptStatus] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [theme, setTheme] = useState<'light'|'dark'>('dark');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('RACE');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('vibe-theme') as 'light'|'dark';
    if (storedTheme === 'light' || storedTheme === 'dark') {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    window.localStorage.setItem('vibe-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!promptStatus) return;
    const timer = window.setTimeout(() => setPromptStatus(''), 3000);
    return () => window.clearTimeout(timer);
  }, [promptStatus]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    const storedName = window.localStorage.getItem('vibe-current-user');
    if (storedName) {
      setUsername(storedName);
    }
  }, []);

  useEffect(() => {
    if (!username) return;
    const users = loadUsers();
    const existing = users[username] ?? { username, projects: [] };
    setUserData(existing);
    setSelectedProjectId(existing.projects[0]?.id ?? null);
  }, [username]);

  useEffect(() => {
    if (!userData) return;
    const users = loadUsers();
    users[userData.username] = userData;
    saveUsers(users);
  }, [userData]);

  const currentProject = useMemo(() => {
    return userData?.projects.find((project) => project.id === selectedProjectId) ?? null;
  }, [userData, selectedProjectId]);

  const hasPendingClarification = useMemo(() => {
    if (!currentProject) return false;
    const last = currentProject.chats.slice(-1)[0];
    return !!last && last.sender === 'assistant' && last.type === 'clarification';
  }, [currentProject]);

  const conversationMessages = currentProject?.chats ?? [];
  const finalPrompts = currentProject?.chats.filter((message) => message.type === 'result') ?? [];
  const latestFinalPrompt = finalPrompts[finalPrompts.length - 1] ?? null;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationMessages, isLoading]);

  const handleLogin = () => {
    const trimmed = usernameInput.trim();
    if (!trimmed) {
      setError('Enter a username to continue.');
      return;
    }
    window.localStorage.setItem('vibe-current-user', trimmed);
    setUsername(trimmed);
    setUsernameInput('');
    setError('');
  };

  const handleLogout = () => {
    window.localStorage.removeItem('vibe-current-user');
    setUsername(null);
    setUserData(null);
    setSelectedProjectId(null);
    setShowNewProjectForm(false);
  };

  const handleCreateProject = () => {
    if (!projectName.trim()) {
      setError('Project name is required.');
      return;
    }
    const newProject: Project = {
      id: uuid(),
      name: projectName.trim(),
      description: projectDescription.trim(),
      chats: []
    };
    setUserData(prev => {
      if (!prev) return prev;
      return { ...prev, projects: [newProject, ...prev.projects] };
    });
    setSelectedProjectId(newProject.id);
    setProjectName('');
    setProjectDescription('');
    setShowNewProjectForm(false);
    setError('');
  };

  const handleDeleteProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this project?")) {
      return;
    }
    setUserData(prev => {
      if (!prev) return prev;
      return { ...prev, projects: prev.projects.filter(p => p.id !== projectId) };
    });
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
    }
  };

  const handleSendPrompt = async () => {
    if (!promptText.trim() || !currentProject) {
      setError('Please enter a message before sending.');
      return;
    }

    const trimmedPrompt = promptText.trim();
    
    // 1. Immediately push user message into chat UI
    const userMessage: ChatMessage = {
      id: uuid(),
      sender: 'user',
      content: trimmedPrompt,
      timestamp: new Date().toISOString(),
      type: hasPendingClarification ? 'note' : 'prompt'
    };

    setUserData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        projects: prev.projects.map(p => 
          p.id === currentProject.id ? { ...p, chats: [...p.chats, userMessage] } : p
        )
      };
    });

    setPromptText('');
    setError('');
    setIsLoading(true);

    try {
      const apiKey = import.meta.env.VITE_GOOGLE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Missing Gemini API Key. Please add VITE_GOOGLE_GEMINI_API_KEY to your .env file.");
      }

      // We form a continuous history block of all user notes and clarifications 
      // specific to this project, including the new message we just created.
      const chatContext = [...currentProject.chats, userMessage]
        .filter((m) => m.type !== 'result')
        .map((msg) => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }));

      const systemPrompt = `${SYSTEM_PROMPT}\n\nWhen generating the final prompt, format it using the ${PROMPT_TEMPLATES[selectedTemplate].label} framework.`;

      const res = await fetch(GEMINI_URL(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: chatContext,
          generationConfig: {
            temperature: 0.4
          }
        })
      });

      if (!res.ok) {
        throw new Error(`Gemini API Error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const responseText = extractGeminiResponse(data);
      const isFinal = responseText.startsWith('FINAL_PROMPT:');
      const cleanContent = isFinal ? responseText.replace('FINAL_PROMPT:', '').trim() : responseText;
      const assistantContent = cleanContent || 'Gemini returned an empty response. Please try again.';

      const assistantMessage: ChatMessage = {
        id: uuid(),
        sender: 'assistant',
        content: assistantContent,
        timestamp: new Date().toISOString(),
        type: isFinal ? 'result' : 'clarification'
      };

      setUserData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          projects: prev.projects.map(p => 
            p.id === currentProject.id ? { ...p, chats: [...p.chats, assistantMessage] } : p
          )
        };
      });

      if (isFinal) {
        setPromptStatus('Final prompt generated from the latest chat context.');
      } else {
        setPromptStatus('Assistant asked a clarification question.');
      }

    } catch (err) {
      console.error("LLM Request Failed:", err);
      setError(err instanceof Error ? err.message : String(err));
      // Revert the locally pushed user message on complete failure so user can retry?
      // Keeping it is fine as well. We'll retain the user message but display the error text explicitly.
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceGenerate = async () => {
    if (!currentProject) return;
    setError('');
    setIsLoading(true);

    try {
      const apiKey = import.meta.env.VITE_GOOGLE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Missing Gemini API Key. Please add VITE_GOOGLE_GEMINI_API_KEY to your .env file.");
      }

      const chatContext = currentProject.chats
        .filter((msg) => msg.type !== 'result')
        .map((msg) => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }));

      chatContext.push({
        role: 'user',
        parts: [{
          text: `Generate the final prompt now using the conversation history above. Do not ask follow-up or clarification questions. Format the prompt using the ${PROMPT_TEMPLATES[selectedTemplate].label} framework. If there is enough context, start your response with FINAL_PROMPT:`
        }]
      });

      const res = await fetch(GEMINI_URL(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: chatContext,
          generationConfig: { temperature: 0.4 }
        })
      });

      if (!res.ok) {
        throw new Error(`Gemini API Error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const responseText = extractGeminiResponse(data);
      const isFinal = responseText.startsWith('FINAL_PROMPT:');
      const cleanContent = isFinal ? responseText.replace('FINAL_PROMPT:', '').trim() : responseText;
      const assistantContent = cleanContent || 'Gemini returned an empty response. Please try again.';

      const assistantMessage: ChatMessage = {
        id: uuid(),
        sender: 'assistant',
        content: assistantContent,
        timestamp: new Date().toISOString(),
        type: isFinal ? 'result' : 'clarification'
      };

      setUserData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          projects: prev.projects.map((project) =>
            project.id === currentProject.id
              ? { ...project, chats: [...project.chats, assistantMessage] }
              : project
          )
        };
      });

      if (isFinal) {
        setPromptStatus('Final prompt generated from the current context.');
      } else {
        setPromptStatus('Assistant requested a follow-up or clarification.');
      }
    } catch (err) {
      console.error('Force generate failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (!username) {
    return (
      <main className="login-shell">
        <section className="glass-panel login-card">
          <div className="d-flex flex-column align-items-center">
            <h1 className="brand-text">Prompt Master</h1>
            <p className="text-secondary m-0 mt-2 text-center" style={{ fontSize: '0.9rem' }}>
              Level up your vibe coding prompts
            </p>
          </div>
          <div>
            <label className="text-secondary mb-2 d-block" style={{ fontSize: '0.85rem' }}>Username</label>
            <input
              type="text"
              className="input-base"
              value={usernameInput}
              onChange={(event) => setUsernameInput(event.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
              placeholder="Enter your name"
              autoFocus
            />
            {error && <div className="error-text">{error}</div>}
          </div>
          <button className="btn-core btn-glow w-100 mt-2" onClick={handleLogin}>
            Launch Session
          </button>
        </section>
      </main>
    );
  }

  const renderedFinalPrompt = latestFinalPrompt?.content || null;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="d-flex align-items-center gap-2">
          <span className="brand-text">Prompt Master</span>
          {currentProject && (
            <span className="text-secondary" style={{ fontSize: '0.9rem', fontWeight: 500 }}>
              <span style={{ opacity: 0.5, margin: '0 0.5rem' }}>/</span>
              {currentProject.name}
            </span>
          )}
        </div>
        <div className="d-flex align-items-center gap-3">
          <button className="btn-icon" onClick={toggleTheme} style={{ padding: '0.4rem', fontSize: '1.2rem' }} aria-label="Toggle Theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <span className="text-main" style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            {username}
          </span>
          <button className="btn-core btn-glass" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="app-body">
        {/* Sidebar */}
        <aside className={`sidebar ${!sidebarOpen ? 'collapsed' : ''}`}>
          {sidebarOpen ? (
            <>
              <div className="sidebar-header">
                <h6 className="m-0 text-secondary" style={{ fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem' }}>Projects</h6>
                <button
                  className="btn-icon"
                  onClick={() => setSidebarOpen(false)}
                  title="Collapse sidebar"
                  style={{ padding: '0.3rem 0.6rem' }}
                >
                  ✕
                </button>
              </div>
              
              <div className="sidebar-content">
                <div className="d-flex flex-column gap-2 mb-3">
                  {userData?.projects.length ? (
                    userData.projects.map((project) => (
                      <div key={project.id} className="project-item-wrapper">
                        <button
                          className={`project-item ${project.id === selectedProjectId ? 'active' : ''}`}
                          onClick={() => setSelectedProjectId(project.id)}
                        >
                          <div className="project-item-content">
                            <div className="project-name">{project.name}</div>
                            {project.description && (
                              <div className="project-desc">{project.description}</div>
                            )}
                          </div>
                          
                          <div className="project-item-actions">
                            <span 
                              className="btn-icon danger" 
                              onClick={(e) => handleDeleteProject(project.id, e)}
                              title="Delete project">
                              ✕
                            </span>
                          </div>
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-secondary" style={{ fontSize: '0.85rem', textAlign: 'center', marginTop: '1rem' }}>No projects yet.</p>
                  )}
                </div>
              </div>

              <div className="sidebar-footer">
                {!showNewProjectForm ? (
                  <button
                    className="btn-core btn-glass w-100"
                    onClick={() => setShowNewProjectForm(true)}
                  >
                    + New Project
                  </button>
                ) : (
                  <div className="glass-panel" style={{ padding: '1rem' }}>
                    <h6 className="m-0 mb-3 text-main" style={{ fontSize: '0.85rem' }}>Create Project</h6>
                    <div className="mb-2">
                      <input
                        type="text"
                        className="input-base"
                        style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                        value={projectName}
                        onChange={(event) => setProjectName(event.currentTarget.value)}
                        placeholder="Name"
                        autoFocus
                      />
                    </div>
                    <div className="mb-3">
                      <textarea
                        className="input-base"
                        style={{ height: '60px', resize: 'none', padding: '0.5rem', fontSize: '0.85rem' }}
                        value={projectDescription}
                        onChange={(event) => setProjectDescription(event.currentTarget.value)}
                        placeholder="Description (optional)"
                      />
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        className="btn-core btn-glow flex-grow-1"
                        style={{ padding: '0.4rem', fontSize: '0.85rem' }}
                        onClick={handleCreateProject}
                      >
                        Create
                      </button>
                      <button
                        className="btn-core btn-ghost border"
                        style={{ padding: '0.4rem', fontSize: '0.85rem', borderColor: 'var(--glass-border)' }}
                        onClick={() => {
                          setShowNewProjectForm(false);
                          setProjectName('');
                          setProjectDescription('');
                          setError('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    {error && projectName === '' && (
                      <div className="error-text">{error}</div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="d-flex align-items-center justify-content-center flex-column gap-2" style={{ height: '100%', padding: '1rem 0' }}>
              <button
                className="btn-icon"
                onClick={() => setSidebarOpen(true)}
                title="Expand sidebar"
                style={{ padding: '0.5rem' }}
              >
                ☰
              </button>
            </div>
          )}
        </aside>

        {/* Workspace */}
        {currentProject ? (
          <main className="workspace">
            {/* Chat Panel */}
            <div className="glass-panel chat-panel">
              <div className="panel-header">
                <div>Conversation</div>
                <div className="d-flex align-items-center gap-2">
                  <div className="text-secondary" style={{ fontSize: '0.8rem', background: 'var(--bg-glass)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
                    {conversationMessages.length} messages
                  </div>
                  {promptStatus && (
                    <div className="status-pill">
                      {promptStatus}
                    </div>
                  )}
                </div>
              </div>

              <div className="panel-body">
                {conversationMessages.length ? (
                  conversationMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`message-row ${message.sender === 'user' ? 'user' : 'assistant'}`}
                    >
                      <div className={`message-bubble ${message.sender === 'user' ? 'user' : (message.type === 'clarification' ? 'clarification' : 'assistant')}`}>
                        {message.type === 'clarification' && message.sender === 'assistant' && (
                          <div style={{ fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontSize: '1.2em' }}>✨</span> Clarification Needed
                          </div>
                        )}
                        <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                        <div className="message-time">
                          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="workspace-empty">
                    <span style={{ fontSize: '2.5rem', opacity: 0.5 }}>💬</span>
                    <p className="m-0">Start pointing the assistant to what you want to code.</p>
                  </div>
                )}
                
                {isLoading && (
                  <div className="message-row assistant">
                    <div className="message-bubble assistant" style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '1rem 1.5rem' }}>
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)', background: 'var(--bg-glass)' }}>
                <div className="d-flex gap-2 align-items-center">
                  <input
                    type="text"
                    className="input-base"
                    style={{ flex: 1, margin: 0, padding: '0.8rem 1.25rem', borderRadius: '30px' }}
                    value={promptText}
                    onChange={(event) => setPromptText(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleSendPrompt();
                      }
                    }}
                    disabled={isLoading}
                    placeholder={hasPendingClarification ? 'Your answer...' : 'Describe the code task...'}
                  />
                  
                  <button 
                    className="btn-icon" 
                    style={{ background: 'var(--accent-gradient)', color: '#fff', width: '42px', height: '42px', borderRadius: '50%' }}
                    onClick={handleSendPrompt} 
                    disabled={isLoading || !promptText.trim()}
                    title="Send Prompt"
                  >
                   ➤
                  </button>

                  <button 
                    className="btn-icon danger" 
                    style={{ width: '42px', height: '42px', borderRadius: '50%' }}
                    onClick={() => {
                      setPromptText('');
                      setError('');
                    }}
                    disabled={isLoading || !promptText}
                    title="Clear Input"
                  >
                   ✕
                  </button>
                </div>
                {error && <div className="error-text" style={{ paddingLeft: '1.25rem' }}>{error}</div>}
              </div>
            </div>

            {/* Final Prompt Panel */}
            <div className="glass-panel final-prompt-panel border" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="panel-header" style={{ background: 'rgba(16, 185, 129, 0.1)', borderBottomColor: 'rgba(16, 185, 129, 0.2)' }}>
                <div style={{ color: '#059669', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>📋</span> Final Prompt
                  </div>
                  <select 
                    className="template-select"
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    title="Select Prompt Template"
                  >
                    {Object.entries(PROMPT_TEMPLATES).map(([key, {label}]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn-core btn-glass"
                    onClick={handleForceGenerate}
                    disabled={isLoading || conversationMessages.length === 0}
                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', color: 'inherit', borderColor: 'var(--glass-border)' }}
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div className="panel-body" style={{ background: 'var(--bg-glass)' }}>
                {renderedFinalPrompt ? (
                  <>
                    <pre className="final-prompt-content">
                      {renderedFinalPrompt}
                    </pre>
                    <div className="final-prompt-actions d-flex align-items-center justify-content-between" style={{ marginTop: '1rem' }}>
                      <button
                        type="button"
                        className="btn-core btn-glass"
                        style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(renderedFinalPrompt);
                            setSuccess('Copied!');
                            window.setTimeout(() => setSuccess(''), 2500);
                          } catch {
                            setError('Copy failed');
                            window.setTimeout(() => setError(''), 2500);
                          }
                        }}
                      >
                        {success || 'Copy'}
                      </button>
                      {success ? (
                        <span className="text-secondary" style={{ fontSize: '0.85rem' }}>{success}</span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="workspace-empty text-secondary">
                    <span style={{ fontSize: '2rem', opacity: 0.3 }}>✨</span>
                    <p className="m-0 text-center" style={{ fontSize: '0.9rem' }}>
                      Refined prompts will appear here.<br/>
                      Perfect for copy-pasting into your agent.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </main>
        ) : (
          <div className="workspace-empty text-secondary" style={{ alignItems: 'center', margin: 'auto' }}>
            <span style={{ fontSize: '3rem', opacity: 0.2 }}>🛠️</span>
            <h4 style={{ color: 'var(--text-muted)' }}>Select or create a project to get started</h4>
          </div>
        )}
      </div>
    </div>
  );
}
