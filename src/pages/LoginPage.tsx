import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const nextPath = useMemo(() => {
    const next = params.get('next') || '/';
    return next.startsWith('/') && !next.startsWith('//') ? next : '/';
  }, [params]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ passcode }),
      });

      if (!response.ok) {
        setError('Invalid passcode.');
        return;
      }

      navigate(nextPath, { replace: true });
    } catch {
      setError('Could not sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <span className="login-kicker">ClipWise</span>
        <h1>Enter passcode</h1>
        <label>
          <span>Passcode</span>
          <input
            autoFocus
            type="password"
            value={passcode}
            onChange={event => setPasscode(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button className="cw-btn cw-btn-primary" type="submit" disabled={submitting || !passcode}>
          {submitting ? 'Checking...' : 'Unlock'}
        </button>
      </form>
    </main>
  );
}
