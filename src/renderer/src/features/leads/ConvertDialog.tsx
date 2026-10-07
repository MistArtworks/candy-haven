import { useState, type ReactNode } from 'react'
import type { OpportunityDraft } from '@shared/domain/leads'
import {
  DEFAULT_CURRENCY,
  OPPORTUNITY_KINDS,
  OPPORTUNITY_KIND_LABEL,
  type OpportunityKind
} from '@shared/domain/leads.constants'
import {
  Dialog,
  DialogChip,
  DialogChips,
  DialogField
} from '@renderer/components/primitives/Dialog'
import { TextInput } from '@renderer/components/primitives/Input'
import { amountOf } from './model'
import styles from './Leads.module.scss'

export interface ConvertDialogProps {
  leadName: string
  busy: boolean
  onSubmit: (draft: Omit<OpportunityDraft, 'leadId'>) => void
  onCancel: () => void
}

/**
 * A lead becomes an opportunity: something concrete to pursue.
 *
 * The lead isn't used up by it. It keeps its contacts, its history and its
 * temperature, and can carry several opportunities over time; each one gets
 * a stage, a value, notes and follow-ups of its own.
 */
export function ConvertDialog({
  leadName,
  busy,
  onSubmit,
  onCancel
}: ConvertDialogProps): ReactNode {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<OpportunityKind>('collaboration')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
  const [notes, setNotes] = useState('')

  const value = amountOf(amount)
  const amountOk = amount.trim() === '' || value !== null
  const canConfirm = title.trim().length > 0 && amountOk && currency.trim().length > 0 && !busy

  const submit = (): void => {
    if (!canConfirm) return
    onSubmit({
      title: title.trim(),
      kind,
      amount: amount.trim() === '' ? null : value,
      currency: currency.trim().toUpperCase(),
      notes: notes.trim()
    })
  }

  return (
    <Dialog
      title="Make an opportunity"
      subtitle={leadName}
      busy={busy}
      confirmLabel="Make it"
      canConfirm={canConfirm}
      onConfirm={submit}
      onCancel={onCancel}
      footnote={`${leadName} stays a lead, with their contacts and history. The opportunity starts Open, with its own stage, value, notes and follow-ups.`}
    >
      <TextInput
        label="What it is"
        value={title}
        onChange={setTitle}
        maxLength={160}
        placeholder="A remix of their next single"
      />
      <DialogField label="Kind">
        <DialogChips>
          {OPPORTUNITY_KINDS.map((entry) => (
            <DialogChip
              key={entry}
              on={kind === entry}
              label={OPPORTUNITY_KIND_LABEL[entry]}
              onClick={() => setKind(entry)}
            />
          ))}
        </DialogChips>
      </DialogField>
      <div className={styles.money}>
        <TextInput
          label="Value"
          value={amount}
          onChange={setAmount}
          mono
          maxLength={14}
          placeholder="Optional"
          invalid={!amountOk}
          hint={amountOk ? undefined : 'A number, as 1200 or 1200.50'}
        />
        <TextInput
          label="Currency"
          value={currency}
          onChange={(next) => setCurrency(next.toUpperCase())}
          mono
          maxLength={8}
        />
      </div>
      <TextInput
        label="Notes"
        value={notes}
        onChange={setNotes}
        maxLength={4000}
        placeholder="Optional: terms, dates, who else is involved"
      />
    </Dialog>
  )
}
