import { parseNullableNumber } from '../helpers'

type SummaryCardTone = 'default' | 'warning' | 'danger' | 'success'

export function SummaryCard({
  label,
  value,
  tone = 'default'
}: {
  label: string
  value: string
  tone?: SummaryCardTone
}) {
  const toneClassName =
    tone === 'warning'
      ? 'text-amber-600'
      : tone === 'danger'
        ? 'text-red-600'
        : tone === 'success'
          ? 'text-green-600'
          : 'text-gray-900 dark:text-white'

  return (
    <div className="card">
      <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClassName}`}>{value}</p>
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  label: string
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'email' | 'date' | 'time'
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="input"
      />
    </label>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  step = '1',
  placeholder
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  step?: string
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? ''}
        onChange={(event) => onChange(parseNullableNumber(event.target.value))}
        placeholder={placeholder}
        className="input"
      />
    </label>
  )
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 4
}: {
  label: string
  value: string | null
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="input resize-none"
      />
    </label>
  )
}

export function CheckboxField({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  )
}

export function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: string | null | undefined
  onChange: (value: string | null) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value ? event.target.value : null)}
        className="input"
      >
        <option value="">Sin asignar</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
