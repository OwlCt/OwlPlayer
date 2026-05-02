interface SubmitButtonProps {
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  type?: 'submit' | 'button';
  onClick?: () => void;
  disabled?: boolean;
}

export default function SubmitButton({
  loading,
  loadingText,
  children,
  variant = 'primary',
  type = 'submit',
  onClick,
  disabled,
}: SubmitButtonProps) {
  const baseClasses = 'px-6 py-3 font-semibold rounded-full transition-colors';
  
  const variantClasses = {
    primary: 'bg-green-500 hover:bg-green-400 disabled:bg-green-500/50 text-black',
    secondary: 'bg-white/10 hover:bg-white/20 text-white',
    danger: 'bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      className={`${baseClasses} ${variantClasses[variant]}`}
    >
      {loading ? loadingText || '处理中...' : children}
    </button>
  );
}
