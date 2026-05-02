import { ReactNode } from 'react';

interface AdminCardProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

export default function AdminCard({ title, children, actions }: AdminCardProps) {
  return (
    <div className="bg-neutral-900 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-white">{title}</h2>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
