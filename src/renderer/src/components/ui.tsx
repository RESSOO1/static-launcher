import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, X } from 'lucide-react'

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle className="spin" width={size} height={size} />
}

export function Empty({ icon, title, text, children }: { icon: ReactNode; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <b>{title}</b>
      {text && <span>{text}</span>}
      {children}
    </div>
  )
}

export function Modal({ title, icon, onClose, children, footer, wide, danger }: { title: string; icon?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; danger?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          {icon && <div className={`modal-icon ${danger ? 'err' : ''}`}>{icon}</div>}
          <h3>{title}</h3>
          <button className="btn ghost sm icon" onClick={onClose} aria-label="Kapat">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.querySelector('.app') ?? document.body
  )
}

export function Confirm({ title, text, confirmLabel = 'Onayla', danger, onConfirm, onClose }: { title: string; text: string; confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className={`btn ${danger ? 'danger' : 'primary'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
                onClose()
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Spinner size={14} />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
        {text}
      </p>
    </Modal>
  )
}

/** Runs an async action, exposes busy state and reports errors through the given toast function. */
export function useAction(toast: (k: 'success' | 'error' | 'info', t: string) => void) {
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key)
    try {
      await fn()
      if (ok) toast('success', ok)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return { busy, run }
}
