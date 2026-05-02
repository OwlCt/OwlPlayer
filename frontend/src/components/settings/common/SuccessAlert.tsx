interface SuccessAlertProps {
  message: string;
}

export default function SuccessAlert({ message }: SuccessAlertProps) {
  return (
    <div className="mb-6 bg-green-500/20 border border-green-500/50 rounded-lg p-4 text-green-200 text-sm">
      {message}
    </div>
  );
}
