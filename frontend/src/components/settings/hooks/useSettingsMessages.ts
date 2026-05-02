import { useState, useCallback } from 'react';

export function useSettingsMessages() {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setSuccessMessage(null);
    setErrorMessage(null);
  }, []);

  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    setErrorMessage(null);
  }, []);

  const showError = useCallback((message: string) => {
    setErrorMessage(message);
    setSuccessMessage(null);
  }, []);

  return {
    successMessage,
    errorMessage,
    clearMessages,
    showSuccess,
    showError,
  };
}
