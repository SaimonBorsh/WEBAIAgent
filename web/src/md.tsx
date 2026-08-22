import React, { useState } from 'react'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let remaining = escapeHtml(text)
  const pattern =
    /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = pattern.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      out.push(<span key={`${keyBase}-t${i}`}>{remaining.slice(lastIndex, match.index)}</span>)
      i++
    }
    const token = match[0]
    const mk = (key: string) => `${keyBase}-${i}-${token.slice(0, 12)}`
    if (token.startsWith('`')) {
      out.push(
        <code key={mk('c')} className="inline-code">
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('**')) {
      out.push(
        <strong key={mk('b')}>
          {renderInline(token.slice(2, -2), mk('bi'))}
        </strong>
      )
    } else if (token.startsWith('__')) {
      out.push(
        <strong key={mk('b')}>
          {renderInline(token.slice(2, -2), mk('bi'))}
        </strong>
      )
    } else if (token.startsWith('*')) {
      out.push(
        <em key={mk('i')}>
          {renderInline(token.slice(1, -1), mk('ii'))}
        </em>
      )
    } else if (token.startsWith('_')) {
      out.push(
        <em key={mk('i')}>
          {renderInline(token.slice(1, -1), mk('ii'))}
        </em>
      )
    } else if (token.startsWith('~~')) {
      out.push(
        <del key={mk('d')}>
          {renderInline(token.slice(2, -2), mk('di'))}
        </del>
      )
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)
      if (linkMatch) {
        out.push(
          <a key={mk('a')} href={linkMatch[2]} target="_blank" rel="noreferrer">
            {linkMatch[1]}
          </a>
        )
      } else {
        out.push(<span key={mk('s')}>{token}</span>)
      }
    } else {
      out.push(<span key={mk('s')}>{token}</span>)
    }
    lastIndex = match.index + token.length
    i++
  }
  if (lastIndex < remaining.length) {
    out.push(<span key={`${keyBase}-end`}>{remaining.slice(lastIndex)}</span>)
  }
  return out
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="code-wrap">
      <pre className="code-block">
        {lang && <div className="code-lang">{lang}</div>}
        <code>{code}</code>
      </pre>
      <button type="button" className="code-copy" onClick={copy} title="Скопировать код" aria-label="Скопировать код">
        {copied ? '✓ Скопировано' : '⧉ Копировать'}
      </button>
    </div>
  )
}

function isTableRow(line: string): boolean {
  return /^\s*\|/.test(line)
}

function parseTableRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isSeparatorRow(cells: string[]): boolean {
  if (cells.length === 0) return false
  return cells.every((c) => /^\s*:?\-+:?\s*$/.test(c))
}

function TableBlock({ rows, keyBase }: { rows: string[][]; keyBase: string }) {
  if (rows.length < 2) return <p className="md-p">{renderInline(rows.map((r) => r.join(' | ')).join('\n'), keyBase)}</p>
  const header = rows[0]
  const isSep = rows.length > 1 && isSeparatorRow(rows[1])
  const body = (isSep ? rows.slice(2) : rows.slice(1)).filter((r) => !isSeparatorRow(r))
  const alignments = header.map((_, colIdx) => {
    const sep = isSep ? (rows[1]?.[colIdx] || '') : ''
    if (sep.startsWith(':') && sep.endsWith(':')) return 'center' as const
    if (sep.endsWith(':')) return 'right' as const
    return 'left' as const
  })

  return (
    <div className="md-table-wrap">
      <table className="md-table">
        <thead>
          <tr>
            {header.map((cell, ci) => (
              <th key={ci} style={{ textAlign: alignments[ci] }}>
                {renderInline(cell, `${keyBase}-th-${ci}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ textAlign: alignments[ci] }}>
                  {renderInline(cell, `${keyBase}-td-${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let blockIndex = 0
  const paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(
        <p key={`p${blockIndex++}`} className="md-p">
          {renderInline(paragraph.join('\n'), `p${blockIndex}`)}
        </p>
      )
      paragraph.length = 0
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    if (/^```/.test(line)) {
      flushParagraph()
      const lang = line.replace(/^```/, '').trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i])
        i++
      }
      i++
      blocks.push(
        <CodeBlock key={`c${blockIndex++}`} lang={lang} code={codeLines.join('\n')} />
      )
      continue
    }

    if (/^#{1,6}\s/.test(line)) {
      flushParagraph()
      const level = line.match(/^(#{1,6})\s/)?.[1].length || 1
      const content = line.replace(/^#{1,6}\s/, '')
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      blocks.push(
        <Tag key={`h${blockIndex++}`} className="md-h">
          {renderInline(content, `h${blockIndex}`)}
        </Tag>
      )
      i++
      continue
    }

    if (isTableRow(line)) {
      flushParagraph()
      const tableRows: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) {
        tableRows.push(parseTableRow(lines[i]))
        i++
      }
      blocks.push(
        <TableBlock key={`t${blockIndex++}`} rows={tableRows} keyBase={`t${blockIndex}`} />
      )
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph()
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={`u${blockIndex++}`} className="md-ul">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `ul${blockIndex}-${idx}`)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph()
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={`o${blockIndex++}`} className="md-ol">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `ol${blockIndex}-${idx}`)}</li>
          ))}
        </ol>
      )
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph()
      const quoteLines: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote key={`q${blockIndex++}`} className="md-quote">
          {renderInline(quoteLines.join(' '), `q${blockIndex}`)}
        </blockquote>
      )
      continue
    }

    if (/^\s*$/.test(line)) {
      flushParagraph()
      i++
      continue
    }

    paragraph.push(line)
    i++
  }
  flushParagraph()

  return <>{blocks}</>
}
