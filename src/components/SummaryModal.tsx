import { useState } from 'react';
import type { Clip } from '../types';
import { formatTime } from '../utils/helpers';

interface Props {
  clip: Clip;
  onSave: (summary: string) => void;
  onClose: () => void;
}

export default function SummaryModal({ clip, onSave, onClose }: Props) {
  const [text, setText] = useState(clip.summary);

  function handleSave() {
    onSave(text.trim());
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal summary-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Clip #{clip.index + 1} Summary</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <p className="modal-subtitle">
          {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
          {' · '}
          Watched {clip.watchCount}x
        </p>
        <textarea
          className="summary-input"
          placeholder="What was this clip about? Write a short summary..."
          value={text}
          onChange={e => setText(e.target.value)}
          autoFocus
          rows={3}
        />
        <div className="form-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>
            {clip.summary ? 'Update' : 'Save'} Summary
          </button>
        </div>
      </div>
    </div>
  );
}
