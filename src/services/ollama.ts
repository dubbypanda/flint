import type { Note, AIAction, AISettings } from '../types';

// ============================================================
// Flint AI Service — 3-Level Fallback
// 1. Python Agent (localhost:5100) → full AI + web + memory
// 2. Direct Ollama (localhost:11434) → AI only
// 3. Browser built-in → note search only
// ============================================================

const AGENT_URL = 'http://localhost:5100';
const DEFAULT_OLLAMA = 'http://localhost:11434';

function timeout(ms: number) {
  return new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), ms)
  );
}

// ── Status Checks ──────────────────────────────────────────

export async function checkOllamaStatus(url: string): Promise<'connected' | 'disconnected'> {
  try {
    const res = await Promise.race([
      fetch(`${AGENT_URL}/status`, { method: 'GET' }),
      timeout(3000),
    ]);
    const data = await (res as Response).json();
    return data.status === 'connected' ? 'connected' : 'disconnected';
  } catch {
    // Try direct Ollama
    try {
      const ollamaUrl = url || DEFAULT_OLLAMA;
      const res = await Promise.race([
        fetch(`${ollamaUrl}/api/tags`, { method: 'GET' }),
        timeout(3000),
      ]);
      return (res as Response).ok ? 'connected' : 'disconnected';
    } catch {
      return 'disconnected';
    }
  }
}

export async function fetchOllamaModels(url: string): Promise<string[]> {
  // Try agent first
  try {
    const res = await Promise.race([
      fetch(`${AGENT_URL}/models`),
      timeout(3000),
    ]);
    const data = await (res as Response).json();
    if (data.models && data.models.length > 0) return data.models;
  } catch { /* agent not running */ }

  // Try direct Ollama
  try {
    const ollamaUrl = url || DEFAULT_OLLAMA;
    const res = await Promise.race([
      fetch(`${ollamaUrl}/api/tags`),
      timeout(3000),
    ]);
    if ((res as Response).ok) {
      const data = await (res as Response).json();
      return (data.models || []).map((m: { name: string }) => m.name);
    }
  } catch { /* ollama not running */ }

  return [];
}

export async function checkAgentStatus(): Promise<boolean> {
  try {
    const res = await Promise.race([
      fetch(`${AGENT_URL}/status`),
      timeout(2000),
    ]);
    return (res as Response).ok;
  } catch {
    return false;
  }
}

// ── Memory Context Preview ─────────────────────────────────

export function buildMemoryContext(
  notes: Note[],
  activeNoteId: string | null,
  query: string,
  _maxNotes: number,
): string {
  if (!notes.length) return 'No notes available.';

  const lines: string[] = [];
  lines.push(`Vault: ${notes.length} notes`);

  const connections: string[] = [];
  notes.forEach(n => {
    const matches = n.content.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g);
    for (const m of matches) {
      const target = notes.find(nt => nt.title.toLowerCase() === m[1].toLowerCase());
      if (target && target.id !== n.id) {
        connections.push(`"${n.title}" → "${target.title}"`);
      }
    }
  });

  if (connections.length > 0) {
    lines.push(`\n${connections.length} connections:`);
    connections.forEach(c => lines.push(`  ${c}`));
  }

  if (activeNoteId) {
    const active = notes.find(n => n.id === activeNoteId);
    if (active) {
      lines.push(`\nActive: "${active.title}"`);
      lines.push(active.content.slice(0, 500));
    }
  }

  lines.push(`\nQuery: "${query}"`);
  return lines.join('\n');
}

// ============================================================
// Main Chat Function — 3-Level Fallback
// ============================================================

export async function askFlintAI(
  userQuery: string,
  notes: Note[],
  activeNoteId: string | null,
  settings: AISettings,
  chatHistory: { role: string; content: string }[],
  onChunk: (chunk: string) => void,
  onDone: (fullContent: string, webResults?: string, usedOllama?: boolean, actions?: AIAction[]) => void,
  onError: (err: string) => void,
): Promise<void> {
  const notesData = notes.map(n => ({
    id: n.id,
    title: n.title,
    content: n.content,
  }));

  const body = {
    query: userQuery,
    notes: notesData,
    activeNoteId,
    settings: {
      provider: settings.provider,
      model: settings.model,
      ollamaUrl: settings.ollamaUrl || DEFAULT_OLLAMA,
      apiKey: settings.apiKey,
      apiBaseUrl: settings.apiBaseUrl,
      localModelPath: settings.localModelPath,
      localModelContext: settings.localModelContext,
      localModelThreads: settings.localModelThreads,
      maxOutputTokens: settings.maxOutputTokens,
      temperature: settings.temperature,
      maxContextNotes: settings.maxContextNotes,
      internetAccess: settings.internetAccess,
      systemPrompt: settings.systemPrompt,
    },
    history: chatHistory,
  };

  let fullContent = '';

  // ── Level 1: Try Python Agent ──────────────────────────
  try {
    console.log('[Flint AI] Trying Python agent...');
    const response = await Promise.race([
      fetch(`${AGENT_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      timeout(8000),
    ]) as Response;

    if (!response.ok) throw new Error(`Agent error ${response.status}`);

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No stream');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const data = JSON.parse(jsonStr);
          if (data.content) {
            fullContent += data.content;
            onChunk(data.content);
          }
          if (data.done) {
            if (data.error && !fullContent) {
              onError(data.error);
            } else {
              onDone(fullContent, data.webResults || undefined, data.usedOllama ?? true, data.actions || undefined);
            }
            return;
          }
        } catch { /* skip bad json */ }
      }
    }

    if (fullContent) {
      onDone(fullContent, undefined, true);
      return;
    }
    throw new Error('Empty response from agent');
  } catch (agentErr) {
    console.warn('[Flint AI] Agent failed:', agentErr instanceof Error ? agentErr.message : agentErr);
  }

  // ── Level 2: Try Direct Ollama ─────────────────────────
  if (settings.provider === 'ollama' && settings.model) {
    try {
      console.log('[Flint AI] Trying direct Ollama with model:', settings.model);
      const ollamaUrl = settings.ollamaUrl || DEFAULT_OLLAMA;

      // Build a simple system prompt with note context
      const memoryLines = buildMemoryContext(notes, activeNoteId, userQuery, settings.maxContextNotes);
      const systemContent = `${settings.systemPrompt}\n\n${memoryLines}`;

      const messages = [
        { role: 'system', content: systemContent },
        ...chatHistory.slice(-8).map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: userQuery },
      ];

      const response = await Promise.race([
        fetch(`${ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: settings.model,
            messages,
            stream: true,
            options: { temperature: settings.temperature, num_ctx: 8192 },
          }),
        }),
        timeout(10000),
      ]) as Response;

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errData.error || `Ollama error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            const content = data.message?.content || '';
            if (content) {
              fullContent += content;
              onChunk(content);
            }
            if (data.done) {
              onDone(fullContent, undefined, true);
              return;
            }
          } catch { /* skip */ }
        }
      }

      if (fullContent) {
        onDone(fullContent, undefined, true);
        return;
      }
      throw new Error('Empty response from Ollama');
    } catch (ollamaErr) {
      const msg = ollamaErr instanceof Error ? ollamaErr.message : String(ollamaErr);
      console.warn('[Flint AI] Direct Ollama failed:', msg);

      // If we got a specific model error, report it
      if (msg.includes('not found') || msg.includes('model')) {
        onError(`Model "${settings.model}" not found. Run: ollama pull ${settings.model}`);
        return;
      }
    }
  }

  // ── Level 3: Browser Built-in Fallback ──────────────────
  console.log('[Flint AI] Using browser built-in fallback');
  fullContent = '';
  const builtin = getBuiltinResponse(userQuery, notes, activeNoteId);
  const chars = builtin.split('');
  let idx = 0;

  const streamBuiltin = () => {
    if (idx < chars.length) {
      const batch = chars.slice(idx, idx + 2).join('');
      fullContent += batch;
      onChunk(batch);
      idx += 2;
      setTimeout(streamBuiltin, 10);
    } else {
      onDone(fullContent, undefined, false);
    }
  };
  streamBuiltin();
}

// ============================================================
// Built-in Browser Fallback
// ============================================================

function getBuiltinResponse(
  query: string,
  notes: Note[],
  activeNoteId: string | null,
): string {
  const q = query.toLowerCase().trim();
  const noteMap = new Map(notes.map(n => [n.id, n]));
  const activeNote = noteMap.get(activeNoteId || '');

  const greetingMatch = q.match(/^\s*(hi|hello|hey|yo|good (morning|afternoon|evening))\b/);
  if (greetingMatch) {
    const noteCount = notes.length;
    return activeNote
      ? `Hi. You are viewing "${activeNote.title}". I can help edit notes, summarize them, or find links. You have ${noteCount} notes.`
      : `Hi. I can help edit notes, summarize them, or find links. You have ${noteCount} notes.`;
  }

  if (q === 'reply' || q === 'replay' || q.includes('reply to this')) {
    return activeNote
      ? `I’m on the active note "${activeNote.title}". Tell me what change you want.`
      : 'Tell me which note you want to work on.';
  }

  if (q.includes('help') || q === '?') {
    return 'I can greet you, summarize notes, find links, rename notes, update note content, create notes, and delete notes.';
  }

  const shortIntent = (text: string) => /^(summarize|summary|list|show|find|search|rename|update|edit|create|delete|remove|add|what|how)\b/.test(text);
  if (!shortIntent(q) && q.length <= 24) {
    return activeNote
      ? `Ask me to summarize, edit, rename, or find links in "${activeNote.title}".`
      : 'Ask me to summarize, edit, rename, or find links in your notes.';
  }

  // Build graph
  const graph = new Map<string, Set<string>>();
  notes.forEach(n => graph.set(n.id, new Set()));
  notes.forEach(n => {
    const matches = n.content.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g);
    for (const m of matches) {
      const target = notes.find(nt => nt.title.toLowerCase() === m[1].toLowerCase());
      if (target && target.id !== n.id) {
        graph.get(n.id)!.add(target.id);
        graph.get(target.id)!.add(n.id);
      }
    }
  });

  const totalConns = [...graph.values()].reduce((sum, s) => sum + s.size, 0) / 2;

  // Help
  if (q.includes('what can you')) {
    return 'I can summarize notes, find links, rename a note, update content, create a note, and delete a note when you ask clearly.';
  }

  // List notes
  if ((q.includes('list') || q.includes('show') || q.includes('what')) && (q.includes('note') || q.includes('all') || q.includes('everything'))) {
    if (!notes.length) return 'Your vault is empty. Create some notes!';
    const rankedNotes = [...notes].sort((a, b) => (graph.get(b.id)?.size || 0) - (graph.get(a.id)?.size || 0));
    let resp = `You have ${notes.length} notes and ${totalConns} connections. Top notes:\n`;
    rankedNotes.slice(0, 8).forEach(n => {
      const conns = graph.get(n.id)?.size || 0;
      resp += `- ${n.title} (${conns} link${conns !== 1 ? 's' : ''})\n`;
    });
    return resp;
  }

  // Connections
  if (q.includes('connection') || q.includes('graph') || q.includes('link')) {
    const connected = [...graph.entries()].filter(([, c]) => c.size > 0);
    if (!connected.length) return 'No connections yet. Use `[[Note Name]]` to link notes together!';
    let resp = `${connected.length} notes have connections. Top links:\n`;
    connected.sort((a, b) => b[1].size - a[1].size);
    for (const [nid, conns] of connected.slice(0, 8)) {
      const names = [...conns].map(id => noteMap.get(id)?.title).filter(Boolean);
      resp += `- ${noteMap.get(nid)?.title}: ${names.join(', ')}\n`;
    }
    return resp;
  }

  // Tags
  if (q.includes('tag')) {
    const allTags = new Map<string, string[]>();
    notes.forEach(n => {
      const tagMatches = n.content.matchAll(/#(\w[\w-]*)/g);
      for (const m of tagMatches) {
        const tag = m[1];
        if (!allTags.has(tag)) allTags.set(tag, []);
        allTags.get(tag)!.push(n.title);
      }
    });
    if (!allTags.size) return 'No tags found. Use `#tag` to categorize notes.';
    let resp = `${allTags.size} tags found. Top tags:\n`;
    for (const [tag, noteList] of [...allTags.entries()].slice(0, 8)) {
      resp += `- #${tag} (${noteList.length} note${noteList.length > 1 ? 's' : ''}): ${noteList.join(', ')}\n`;
    }
    return resp;
  }

  // Summarize
  if (q.includes('summarize') || q.includes('summary')) {
    if (!notes.length) return 'Nothing to summarize — vault is empty.';
    let resp = `Vault summary: ${notes.length} notes, ${totalConns} connections. Key notes:\n`;
    notes.slice(0, 8).forEach(n => {
      const firstLine = n.content.split('\n').find(l => l.trim() && !l.startsWith('#')) || '';
      resp += `- ${n.title}: ${firstLine.slice(0, 90)}${firstLine.length > 90 ? '...' : ''}\n`;
    });
    return resp;
  }

  // Search by keywords
  const words = q.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 2);
  const matched = notes.filter(n => {
    const content = (n.title + ' ' + n.content).toLowerCase();
    return words.some(w => content.includes(w));
  });

  if (matched.length > 0) {
    let resp = activeNote
      ? `Viewing "${activeNote?.title}". Related notes:\n`
      : `Found ${matched.length} relevant notes:\n`;

    matched.slice(0, 5).forEach(n => {
      const conns = [...(graph.get(n.id) || [])].map(id => noteMap.get(id)?.title).filter(Boolean);
      resp += `- ${n.title}${conns.length ? ` (linked to ${conns.join(', ')})` : ''}\n`;
      const paragraphs = n.content.split('\n\n').filter(p => p.trim());
      const relevant = paragraphs.filter(p => words.some(w => p.toLowerCase().includes(w))).slice(0, 1);
      const snippet = (relevant.length ? relevant : paragraphs.slice(0, 1))[0] || '';
      resp += `  ${snippet.slice(0, 160)}${snippet.length > 160 ? '...' : ''}\n`;
    });

    if (matched.length > 5) resp += `...and ${matched.length - 5} more.\n`;
    resp += `\nFound across ${notes.length} notes with ${totalConns} connections.`;
    return resp;
  }

  // Default
  let resp = `I couldn't find a direct match for "${query}".\n`;
  if (notes.length > 0) {
    resp += 'Try one of these notes:\n';
    notes.slice(0, 6).forEach(n => { resp += `- ${n.title}\n`; });
    if (notes.length > 6) resp += `...and ${notes.length - 6} more\n`;
  }
  resp += 'Ask for summarize, list notes, links, rename, or update note.';
  return resp;
}
