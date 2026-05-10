export default function KeyboardHints() {
  return (
    <div className="cw-keys" aria-hidden>
      <span className="cw-key-hint"><span className="cw-key">N</span> new video</span>
      <span className="cw-key-hint"><span className="cw-key">F</span> start feed</span>
      <span className="cw-key-hint"><span className="cw-key">/</span> search</span>
      <span className="cw-key-hint">
        <span className="cw-key">1</span>
        <span className="cw-key">–</span>
        <span className="cw-key">4</span> filter
      </span>
      <span className="cw-key-hint"><span className="cw-key">Space</span> resume last</span>
    </div>
  );
}
