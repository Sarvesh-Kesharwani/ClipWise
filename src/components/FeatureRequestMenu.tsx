import { useMemo, useState } from 'react';
import { useApp } from '../store/useApp';
import { currentTimestamp, generateId } from '../utils/helpers';

export default function FeatureRequestMenu() {
  const {
    featureRequests,
    addFeatureRequest,
    toggleFeatureRequestComplete,
    deleteFeatureRequest,
  } = useApp();
  const [description, setDescription] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const sortedRequests = useMemo(() => {
    return [...featureRequests].sort((a, b) => {
      if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
      return b.createdAt - a.createdAt;
    });
  }, [featureRequests]);

  function handleAdd() {
    const text = description.trim();
    if (!text) return;

    addFeatureRequest({
      id: generateId(),
      description: text,
      completed: false,
      createdAt: currentTimestamp(),
    });
    setDescription('');
  }

  return (
    <div className="feature-request-menu">
      <div className="feature-request-menu-header">
        <span className="settings-dropdown-label">Requests</span>
        <span className="feature-request-count">
          {featureRequests.filter(request => !request.completed).length} open
        </span>
      </div>

      <div className="feature-request-create">
        <input
          className="input feature-request-input"
          type="text"
          placeholder="New feature or bug fix request"
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
        <button
          className="btn-primary feature-request-add-btn"
          onClick={handleAdd}
          disabled={!description.trim()}
        >
          Add
        </button>
      </div>

      {sortedRequests.length === 0 ? (
        <p className="feature-request-empty">No requests yet.</p>
      ) : (
        <div className="feature-request-list">
          {sortedRequests.map(request => {
            const isConfirmingDelete = pendingDeleteId === request.id;

            return (
              <div
                key={request.id}
                className={`feature-request-item ${request.completed ? 'completed' : ''}`}
              >
                <label className="feature-request-main">
                  <input
                    type="checkbox"
                    checked={request.completed}
                    onChange={() => toggleFeatureRequestComplete(request.id)}
                  />
                  <span>{request.description}</span>
                </label>

                {!isConfirmingDelete ? (
                  <button
                    className="feature-request-delete"
                    onClick={() => setPendingDeleteId(request.id)}
                    aria-label={`Delete request: ${request.description}`}
                    title="Delete request"
                  >
                    Delete
                  </button>
                ) : (
                  <div className="feature-request-confirm">
                    <span>Delete?</span>
                    <button
                      className="feature-request-confirm-btn danger"
                      onClick={() => {
                        deleteFeatureRequest(request.id);
                        setPendingDeleteId(null);
                      }}
                    >
                      Yes
                    </button>
                    <button
                      className="feature-request-confirm-btn"
                      onClick={() => setPendingDeleteId(null)}
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
