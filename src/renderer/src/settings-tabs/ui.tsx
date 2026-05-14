import type { ReactNode } from 'react'

export function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-200">{label}</label>
      {hint && <p className="mt-1 text-xs leading-relaxed text-neutral-500">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

export function Toggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-white/10">
      <span>
        <span className="block text-sm font-medium text-neutral-100">{label}</span>
        {description && (
          <span className="mt-1 block text-xs leading-relaxed text-neutral-500">
            {description}
          </span>
        )}
      </span>
      <span
        className={
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ' +
          (checked ? 'bg-violet-500' : 'bg-neutral-700')
        }
      >
        <span
          className={
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ' +
            (checked ? 'translate-x-[18px]' : 'translate-x-[3px]')
          }
        />
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </span>
    </label>
  )
}
