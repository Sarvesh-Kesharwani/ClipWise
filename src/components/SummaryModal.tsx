import { useMemo, useState } from 'react';
import type { Clip } from '../types';
import { formatTime } from '../utils/helpers';
import {
  buildLifeRecommendations,
  CONTEXT_ABOUT_ME_NOTION_URL,
  DEFAULT_USER_LIFE_CONTEXT,
} from '../utils/lifeRecommendations';

interface Props {
  clip: Clip;
  videoTitle?: string;
  clipText?: string;
  lifeContext?: string;
  onSave: (summary: string, lifeRecommendations: string[], lifeContextSnapshot: string) => void;
  onClose: () => void;
}

export default function SummaryModal({
  clip,
  videoTitle,
  clipText,
  lifeContext = DEFAULT_USER_LIFE_CONTEXT,
  onSave,
  onClose,
}: Props) {
  const [text, setText] = useState(clip.summary);
  const trimmedText = text.trim();
  const recommendations = useMemo(() => {
    return buildLifeRecommendations({
      lifeContext,
      videoTitle,
      clipText,
      summaryText: trimmedText,
    });
  }, [clipText, lifeContext, trimmedText, videoTitle]);

  function handleSave() {
    if (!trimmedText) return;
    onSave(trimmedText, recommendations, lifeContext);
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
        {recommendations.length > 0 && (
          <div className="life-recommendations">
            <span className="life-recommendations-label">Personal use from Notion context</span>
            <a className="life-recommendations-source" href={CONTEXT_ABOUT_ME_NOTION_URL} target="_blank" rel="noreferrer">
              context-about-me
            </a>
            {recommendations.map((recommendation, index) => (
              <div
                key={recommendation}
                className="life-recommendation"
              >
                <strong>{index + 1}</strong>
                <span>{recommendation}</span>
              </div>
            ))}
          </div>
        )}
        <div className="form-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={!trimmedText}>
            {clip.summary ? 'Update' : 'Save'} Summary
          </button>
        </div>
      </div>
    </div>
  );
}
