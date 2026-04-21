import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../store';

export function Preview({ noteId }: { noteId: string }) {
  const { state, dispatch, getNoteByTitle, createNote } = useStore();
  const note = state.notes.find(n => n.id === noteId);

  const processedContent = useMemo(() => {
    if (!note) return '';
    // Replace wiki links with clickable spans
    return note.content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => {
      const display = alias || target;
      const exists = getNoteByTitle(target.trim());
      return `<span class="wiki-link ${exists ? '' : 'unresolved'}" data-target="${target.trim()}">${display}</span>`;
    });
  }, [note, getNoteByTitle]);

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('wiki-link')) {
      const linkTarget = target.getAttribute('data-target');
      if (linkTarget) {
        const existingNote = getNoteByTitle(linkTarget);
        if (existingNote) {
          dispatch({ type: 'OPEN_TAB', payload: existingNote.id });
        } else {
          createNote(null, linkTarget);
        }
      }
    }
  };

  if (!note) return null;

  return (
    <div className="flint-preview" onClick={handleClick}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom checkbox styling
          input: ({ ...props }) => <input {...props} className="accent-[#f59e0b]" />,
          // Code block wrapper
          pre: ({ children }) => (
            <pre className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg p-4 overflow-x-auto my-4">
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className="bg-[#1a1a1a] text-[#f59e0b] px-1.5 py-0.5 rounded text-[13px] font-mono">
                {children}
              </code>
            ) : (
              <code className="text-[13px] leading-relaxed font-mono">{children}</code>
            );
          },
          // Link styling
          a: ({ href, children }) => (
            <a href={href} className="text-[#f59e0b] hover:text-[#fbbf24] no-underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-[#f59e0b] bg-[#f59e0b]/[0.03] pl-4 pr-3 py-2 rounded-r-md my-4 text-[#aaa]">
              {children}
            </blockquote>
          ),
          // Table
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-[#111] text-left px-3 py-2 border border-[#1e1e1e] font-semibold text-[#ccc] text-xs">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border border-[#1e1e1e] text-[#aaa]">{children}</td>
          ),
          // Horizontal rule
          hr: () => <hr className="border-none border-t border-[#1e1e1e] my-6" />,
        }}
        allowedElements={['p', 'br', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'input', 'span', 'div']}
        rehypePlugins={[]}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
