interface ErrorAlertProps {
  message: string;
}

export default function ErrorAlert({ message }: ErrorAlertProps) {
  return (
    <div className="mb-6 bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-200 text-sm">
      {message}
    </div>
  );
}
