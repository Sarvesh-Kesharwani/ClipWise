import { useState, useMemo } from 'react';

interface Props {
  onConfirm: () => void;
  onClose: () => void;
}

function generateConfirmPhrase(): string {
  const words = ['reset', 'delete', 'erase', 'clear', 'wipe', 'remove'];
  const nums = Math.floor(Math.random() * 900 + 100);
  const word = words[Math.floor(Math.random() * words.length)];
  return `${word}-${nums}`;
}

export default function ResetProgressModal({ onConfirm, onClose }: Props) {
  const [step, setStep] = useState<'warn' | 'verify'>('warn');
  const confirmPhrase = useMemo(() => generateConfirmPhrase(), []);
  const [typed, setTyped] = useState('');

  const canConfirm = typed === confirmPhrase;

  function handleFinalConfirm() {
    if (!canConfirm) return;
    onConfirm();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal reset-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{step === 'warn' ? 'Reset All Progress' : 'Final Verification'}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {step === 'warn' ? (
          <>
            <div className="reset-warning">
              <span className="reset-warning-icon">&#9888;</span>
              <p>
                This will <strong>permanently delete</strong> all your videos, clips,
                watch progress, summaries, folders, and remixes.
              </p>
              <p>
                If you have Google Drive sync enabled, your cloud backup will be
                overwritten with empty data on the next sync.
              </p>
            </div>
            <div className="form-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-danger" onClick={() => setStep('verify')}>
                I understand, continue
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="reset-verify-prompt">
              Type <strong className="reset-phrase">{confirmPhrase}</strong> below to confirm:
            </p>
            <input
              className="input reset-verify-input"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={confirmPhrase}
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
            <div className="form-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="btn-danger"
                onClick={handleFinalConfirm}
                disabled={!canConfirm}
              >
                Reset Everything
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
