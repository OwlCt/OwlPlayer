interface ErrorAlertProps {
  message: string;
  onClose: () => void;
}

export default function ErrorAlert({ message, onClose }: ErrorAlertProps) {
  return (
    <div className="mb-6 bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-200 text-sm">
      {message}
      <button onClick={onClose} className="ml-4 underline">关闭</button>
    </div>
  );
}
