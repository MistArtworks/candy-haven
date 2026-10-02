import type { ReactNode } from 'react'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { wordCount } from './markdownEdits'
import type { MarkdownEditing } from './useMarkdownEditing'
import styles from '../Lore.module.scss'

// ------------------------------------------------------------------ icons

const ICONS: Record<string, ReactNode> = {
  heading: <path d="M2.5 2.5v9M9.5 2.5v9M2.5 7h7M11.5 6.2l1.3-.9v6.2" />,
  bullet: (
    <>
      <path d="M5.5 3.5H13M5.5 7H13M5.5 10.5H13" />
      <circle cx="2.4" cy="3.5" r=".9" fill="currentColor" stroke="none" />
      <circle cx="2.4" cy="7" r=".9" fill="currentColor" stroke="none" />
      <circle cx="2.4" cy="10.5" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  entry: (
    <>
      <path d="M1.5 3.5h3.5M1.5 7.5h3.5M7 3.5h5.5M7 7.5h5.5M1.5 11.5h11" strokeWidth="1.1" />
      <path d="M1.5 3.5h3.5M1.5 7.5h3.5" strokeWidth="2" />
    </>
  ),
  quote: (
    <path
      d="M2.5 9.8c0-2.7 1-4.6 3-5.6M8.5 9.8c0-2.7 1-4.6 3-5.6M2.5 9.8h2.6v-2.6H2.5zM8.5 9.8h2.6v-2.6H8.5z"
      strokeLinejoin="round"
    />
  ),
  clear: <path d="M3 3h7M6.5 3l-2 8M9 9.5l3 3M12 9.5l-3 3" />,
  undo: <path d="M4.5 4.5 2 7l2.5 2.5M2.2 7H9a3 3 0 0 1 0 6H6.5" />,
  redo: <path d="M9.5 4.5 12 7l-2.5 2.5M11.8 7H5a3 3 0 0 0 0 6h2.5" />
}

function Icon({ name }: { name: string }): ReactNode {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  )
}

function Tool({
  label,
  hint,
  pressed,
  onPress,
  children
}: {
  label: string
  hint: string
  pressed?: boolean
  onPress: () => void
  children: ReactNode
}): ReactNode {
  return (
    <button
      type="button"
      className={styles.formatButton}
      aria-label={label}
      aria-pressed={pressed}
      data-on={pressed || undefined}
      // Keeps the text box's selection: a press that took focus would lose it.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      {...tooltipTrigger(hint)}
    >
      {children}
    </button>
  )
}

/**
 * The formatting bar over the chapter's text: what the website can show,
 * one press each, as in a word processor. What each does is said on hover,
 * with the mark it writes, for whoever would rather type it.
 */
export function FormatBar({
  editing,
  text,
  limit
}: {
  editing: MarkdownEditing
  text: string
  limit: number
}): ReactNode {
  const { active, run, undo, redo } = editing
  const words = wordCount(text)
  return (
    <div className={styles.formatBar} role="toolbar" aria-label="Formatting">
      <Tool
        label="Bold"
        hint="Bold (Ctrl+B). Writes **words**"
        pressed={active.bold}
        onPress={() => run('bold')}
      >
        <span className={styles.glyphBold}>B</span>
      </Tool>
      <Tool
        label="Italic"
        hint="Italic, in the website's gold (Ctrl+I). Writes *words*"
        pressed={active.italic}
        onPress={() => run('italic')}
      >
        <span className={styles.glyphItalic}>I</span>
      </Tool>
      <span className={styles.formatGap} aria-hidden="true" />
      <Tool
        label="Heading"
        hint="Heading: a title inside the chapter. Writes ## at the start of the line"
        pressed={active.style === 'heading'}
        onPress={() => run('heading')}
      >
        <Icon name="heading" />
      </Tool>
      <Tool
        label="Bulleted list"
        hint="Bulleted list. Enter starts the next item; Enter on an empty one ends the list"
        pressed={active.style === 'bullet'}
        onPress={() => run('bullet')}
      >
        <Icon name="bullet" />
      </Tool>
      <Tool
        label="Terms"
        hint="Terms: a word picked out, then what it means. Writes - **Term**: what it is"
        pressed={active.style === 'entry'}
        onPress={() => run('entry')}
      >
        <Icon name="entry" />
      </Tool>
      <Tool
        label="Large quote"
        hint="Large quote: a line set big, on its own. Writes > at the start of the line"
        pressed={active.style === 'quote'}
        onPress={() => run('quote')}
      >
        <Icon name="quote" />
      </Tool>
      <span className={styles.formatGap} aria-hidden="true" />
      <Tool
        label="Clear formatting"
        hint="Clear formatting: plain text again"
        onPress={() => run('clear')}
      >
        <Icon name="clear" />
      </Tool>
      <span className={styles.formatGap} aria-hidden="true" />
      <Tool label="Undo" hint="Undo (Ctrl+Z)" onPress={undo}>
        <Icon name="undo" />
      </Tool>
      <Tool label="Redo" hint="Redo (Ctrl+Y)" onPress={redo}>
        <Icon name="redo" />
      </Tool>
      <span className={styles.spacer} />
      <span className={styles.formatCount}>
        {words.toLocaleString()} word{words === 1 ? '' : 's'} · {text.length.toLocaleString()} /{' '}
        {limit.toLocaleString()}
      </span>
    </div>
  )
}
