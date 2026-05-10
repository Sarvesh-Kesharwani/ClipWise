import { IconPlus } from './DashIcons';

interface Props {
  onClick: () => void;
  label?: string;
}

export default function EmptyCard({ onClick, label = 'Drop a link or paste URL' }: Props) {
  return (
    <button className="cw-empty-card" onClick={onClick} type="button">
      <span className="cw-empty-card-ring" aria-hidden>
        <IconPlus size={16} />
      </span>
      <span style={{ fontSize: 12 }}>{label}</span>
    </button>
  );
}
