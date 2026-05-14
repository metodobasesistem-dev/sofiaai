import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

export type QualityScore = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

interface Props {
  score: QualityScore | string | undefined;
  /** Previous score, used to derive trend arrow */
  previousScore?: QualityScore | string;
  size?: 'sm' | 'xs';
}

const SCORE_ORDER: Record<string, number> = { GREEN: 2, YELLOW: 1, RED: 0, UNKNOWN: -1 };

const LABELS: Record<string, string> = {
  GREEN: 'Alta',
  YELLOW: 'Média',
  RED: 'Baixa',
  UNKNOWN: '—',
};

const COLOR: Record<string, string> = {
  GREEN: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  YELLOW: 'bg-amber-100 text-amber-700 border-amber-200',
  RED: 'bg-red-100 text-red-700 border-red-200',
  UNKNOWN: 'bg-slate-100 text-slate-500 border-slate-200',
};

const DOT: Record<string, string> = {
  GREEN: 'bg-emerald-500',
  YELLOW: 'bg-amber-500',
  RED: 'bg-red-500',
  UNKNOWN: 'bg-slate-400',
};

/**
 * Small badge showing Meta template quality_score (GREEN/YELLOW/RED) with an
 * optional trend arrow derived from comparing current vs previous score.
 */
export default function TemplateQualityBadge({ score, previousScore, size = 'xs' }: Props) {
  const key = (score || 'UNKNOWN').toUpperCase() as QualityScore;
  const prevKey = previousScore ? (previousScore.toUpperCase() as QualityScore) : undefined;

  const cur = SCORE_ORDER[key] ?? -1;
  const prev = prevKey !== undefined ? (SCORE_ORDER[prevKey] ?? -1) : undefined;
  const trend = prev === undefined ? null : cur > prev ? 'up' : cur < prev ? 'down' : 'flat';

  const iconSize = size === 'xs' ? 9 : 11;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${COLOR[key]}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[key]}`} />
      {LABELS[key]}
      {trend === 'up' && <TrendingUp size={iconSize} className="text-emerald-600" />}
      {trend === 'down' && <TrendingDown size={iconSize} className="text-red-500" />}
      {trend === 'flat' && <Minus size={iconSize} className="opacity-40" />}
    </span>
  );
}
