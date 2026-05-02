interface FormInputProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  hint?: string;
  maxLength?: number;
}

export default function FormInput({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled,
  readOnly,
  hint,
  maxLength,
}: FormInputProps) {
  const isDisabled = disabled || readOnly;
  
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-white/80 mb-2">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        disabled={isDisabled}
        maxLength={maxLength}
        className={`w-full px-4 py-3 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-green-500 ${
          isDisabled
            ? 'bg-neutral-800/50 text-white/60 cursor-not-allowed'
            : 'bg-neutral-800'
        }`}
      />
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    </div>
  );
}
