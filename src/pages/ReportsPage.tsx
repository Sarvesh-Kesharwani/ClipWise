import { useNavigate } from 'react-router-dom';
import MobileNav from '../components/MobileNav';
import TopBar from '../components/dashboard/TopBar';
import { useApp } from '../store/useApp';
import { computeAverageDailyClips, getTodaySnapshot } from '../utils/progress';

export default function ReportsPage() {
  const navigate = useNavigate();
  const { progress, cloudSync, featureRequests } = useApp();
  const snapshot = getTodaySnapshot(progress);
  const daily = progress.daily.slice(-30);
  const average = computeAverageDailyClips(progress);
  const totalClips = progress.daily.reduce((sum, day) => sum + day.clipsCompleted, 0);
  const maxClips = Math.max(1, ...daily.map(day => day.clipsCompleted), ...daily.map(day => day.target));
  const requestsOpen = featureRequests.filter(request => !request.completed).length;

  return (
    <div className="cw-page reports-page app-page-with-mobile-nav">
      <TopBar
        freezes={snapshot.freezes}
        requestsCount={requestsOpen}
        profile={cloudSync.userProfile}
      />

      <header className="reports-header">
        <button className="back-btn reports-back" onClick={() => navigate('/')}>Dashboard</button>
        <div>
          <h1>Reports</h1>
          <p>Daily clips, streak pressure, and rewards.</p>
        </div>
      </header>

      <section className="reports-metrics">
        <MetricCard label="Today" value={`${snapshot.clipsCompleted}/${snapshot.target}`} detail="clips vs target" />
        <MetricCard label="Average" value={average.toFixed(1)} detail="clips per active day" />
        <MetricCard label="Streak" value={`${snapshot.currentStreak}d`} detail={`best ${snapshot.bestStreak}d`} />
        <MetricCard label="Freezes" value={String(snapshot.freezes)} detail={`${snapshot.extraClipsBank}/50 extra clips`} />
      </section>

      <section className="reports-chart-panel">
        <div className="reports-section-title">
          <h2>Clip Completions</h2>
          <span>{daily.length ? 'Last 30 active/report days' : 'No completions yet'}</span>
        </div>

        {daily.length === 0 ? (
          <div className="reports-empty">
            <strong>No clip data yet.</strong>
            <span>Complete clips in Player, Remix, or Feed to build your graph.</span>
          </div>
        ) : (
          <div className="reports-chart-wrap">
            <svg className="reports-line-chart" viewBox="0 0 720 280" role="img" aria-label="Daily completed clips line graph">
              <ChartGrid />
              <polyline
                className="reports-target-line"
                points={pointsFor(daily.map(day => day.target), maxClips)}
              />
              <polyline
                className="reports-complete-line"
                points={pointsFor(daily.map(day => day.clipsCompleted), maxClips)}
              />
              {daily.map((day, index) => {
                const { x, y } = pointFor(index, daily.length, day.clipsCompleted, maxClips);
                return <circle key={day.date} className="reports-point" cx={x} cy={y} r="5" />;
              })}
            </svg>
            <div className="reports-chart-legend">
              <span><i className="legend-dot complete" /> Completed</span>
              <span><i className="legend-dot target" /> Target</span>
            </div>
            <div className="reports-date-strip">
              <span>{daily[0]?.date}</span>
              <span>{daily[daily.length - 1]?.date}</span>
            </div>
          </div>
        )}
      </section>

      <section className="reports-table-panel">
        <div className="reports-section-title">
          <h2>Daily Log</h2>
          <span>{totalClips} total clips</span>
        </div>
        <div className="reports-daily-list">
          {progress.daily.slice().reverse().slice(0, 14).map(day => (
            <div key={day.date} className={`reports-day-row ${day.clipsCompleted >= day.target || day.freezeUsed ? 'met' : ''}`}>
              <strong>{day.date}</strong>
              <span>{day.clipsCompleted}/{day.target} clips</span>
              <small>{day.freezeUsed ? 'Freeze protected' : day.clipsCompleted >= day.target ? 'Target met' : 'Partial'}</small>
            </div>
          ))}
        </div>
      </section>

      <MobileNav />
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="reports-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ChartGrid() {
  return (
    <>
      {[0, 1, 2, 3].map(row => (
        <line
          key={row}
          className="reports-grid-line"
          x1="36"
          x2="700"
          y1={40 + row * 60}
          y2={40 + row * 60}
        />
      ))}
    </>
  );
}

function pointsFor(values: number[], max: number): string {
  return values.map((value, index) => {
    const { x, y } = pointFor(index, values.length, value, max);
    return `${x},${y}`;
  }).join(' ');
}

function pointFor(index: number, length: number, value: number, max: number) {
  const x = length <= 1 ? 60 : 48 + (index / (length - 1)) * 640;
  const y = 238 - (Math.max(0, value) / max) * 190;
  return { x, y };
}
