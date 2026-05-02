interface StatCardProps {
  label: string;
  value: string | number;
  valueClassName?: string;
  small?: boolean;
}

export default function StatCard({ label, value, valueClassName = 'text-white text-xl font-medium', small }: StatCardProps) {
  return (
    <div className="bg-white/5 rounded-lg p-4">
      <div className="text-white/60 text-sm mb-1">{label}</div>
      <div className={small ? 'text-white text-sm' : valueClassName}>
        {value}
      </div>
    </div>
  );
}
