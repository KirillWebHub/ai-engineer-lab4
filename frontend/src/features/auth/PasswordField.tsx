import type { Ref } from 'react'

interface PasswordFieldProps {
  id: string
  value: string
  visible: boolean
  readOnly: boolean
  autoComplete: 'current-password' | 'new-password'
  inputRef?: Ref<HTMLInputElement>
  hint?: string
  error?: string
  onChange: (value: string) => void
  onToggle: () => void
}

export function PasswordField({
  id, value, visible, readOnly, autoComplete, inputRef, hint, error, onChange, onToggle,
}: PasswordFieldProps) {
  const descriptions = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ')
  return (
    <div className="form-field">
      <label htmlFor={id}>Пароль</label>
      <div className="password">
        <input
          ref={inputRef} id={id} name="password" type={visible ? 'text' : 'password'}
          autoComplete={autoComplete} required readOnly={readOnly} value={value}
          onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)}
          aria-describedby={descriptions || undefined}
        />
        <button
          type="button" className="peek" disabled={readOnly} onClick={onToggle}
          aria-controls={id} aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={visible}
        >
          <svg className="eye-open" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.1 12s3.6-6 9.9-6 9.9 6 9.9 6-3.6 6-9.9 6-9.9-6-9.9-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>
          <svg className="eye-closed" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 3 18 18M10.7 6.1 12 6c6.3 0 9.9 6 9.9 6a14 14 0 0 1-2.2 2.7M6.4 7.9A16 16 0 0 0 2.1 12s3.6 6 9.9 6a10 10 0 0 0 4.1-.9" /></svg>
        </button>
      </div>
      {hint && <p id={`${id}-hint`} className="hint">{hint}</p>}
      {error && <p id={`${id}-error`} className="field-error">{error}</p>}
    </div>
  )
}
