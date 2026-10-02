import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject
} from 'react'
import {
  activeAt,
  clearFormatting,
  onEnter,
  toggleInline,
  toggleLines,
  type Active,
  type Edit,
  type LineStyle,
  type Range
} from './markdownEdits'

export type FormatCommand = 'bold' | 'italic' | LineStyle | 'clear'

const EDITS: Record<FormatCommand, (text: string, selection: Range) => Edit> = {
  bold: (text, selection) => toggleInline(text, selection, '**'),
  italic: (text, selection) => toggleInline(text, selection, '*'),
  heading: (text, selection) => toggleLines(text, selection, 'heading'),
  bullet: (text, selection) => toggleLines(text, selection, 'bullet'),
  entry: (text, selection) => toggleLines(text, selection, 'entry'),
  quote: (text, selection) => toggleLines(text, selection, 'quote'),
  clear: clearFormatting
}

const NOTHING: Active = { bold: false, italic: false, style: null }

export interface MarkdownEditing {
  active: Active
  run: (command: FormatCommand) => void
  undo: () => void
  redo: () => void
  /** For the text box: Ctrl+B, Ctrl+I, and Enter the word processor's way. */
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  /** For the text box: keeps the bar's pressed buttons in step with the caret. */
  onSelect: () => void
}

/**
 * Formatting a text box of markdown as a word processor would.
 *
 * Every edit goes in through the browser's own typing (`insertText`), so
 * Ctrl+Z and Undo take it back like anything typed, and the box's change
 * handler hears it as it hears a keystroke. Where that isn't available
 * the new text is handed to `onChange` instead, and the selection put
 * back once it's drawn.
 */
export function useMarkdownEditing(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (value: string) => void
): MarkdownEditing {
  const [active, setActive] = useState<Active>(NOTHING)
  const pending = useRef<Range | null>(null)

  const selectionOf = (box: HTMLTextAreaElement): Range => ({
    start: box.selectionStart,
    end: box.selectionEnd
  })

  const sync = useCallback(() => {
    const box = ref.current
    if (box) setActive(activeAt(box.value, selectionOf(box)))
  }, [ref])

  const apply = (edit: Edit | null): boolean => {
    const box = ref.current
    if (!box || !edit) return false
    box.focus()
    box.setSelectionRange(edit.from, edit.to)
    const typed =
      edit.insert.length > 0
        ? document.execCommand('insertText', false, edit.insert)
        : edit.from === edit.to || document.execCommand('delete')
    if (typed) {
      box.setSelectionRange(edit.select.start, edit.select.end)
    } else {
      pending.current = edit.select
      onChange(box.value.slice(0, edit.from) + edit.insert + box.value.slice(edit.to))
    }
    sync()
    return true
  }

  useLayoutEffect(() => {
    const box = ref.current
    const selection = pending.current
    if (!box || !selection) return
    pending.current = null
    box.setSelectionRange(selection.start, selection.end)
  }, [value, ref])

  const run = (command: FormatCommand): void => {
    const box = ref.current
    if (box) apply(EDITS[command](box.value, selectionOf(box)))
  }

  const history = (command: 'undo' | 'redo'): void => {
    const box = ref.current
    if (!box) return
    box.focus()
    document.execCommand(command)
    sync()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    const box = event.currentTarget
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      const key = event.key.toLowerCase()
      if (key === 'b' || key === 'i') {
        event.preventDefault()
        run(key === 'b' ? 'bold' : 'italic')
        return
      }
    }
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.nativeEvent.isComposing
    ) {
      const edit = onEnter(box.value, selectionOf(box))
      if (edit) {
        event.preventDefault()
        apply(edit)
      }
    }
  }

  return {
    active,
    run,
    undo: () => history('undo'),
    redo: () => history('redo'),
    onKeyDown,
    onSelect: sync
  }
}
