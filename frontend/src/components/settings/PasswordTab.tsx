import { usePasswordTab } from './hooks';
import { useIsMobile } from '../../hooks/useIsMobile';
import { SuccessAlert, ErrorAlert, FormInput, SubmitButton } from './common';

export default function PasswordTab() {
  const isMobile = useIsMobile();
  const {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    isChangingPassword,
    error,
    success,
    handlePasswordChange,
  } = usePasswordTab();

  return (
    <>
      {success && <SuccessAlert message={success} />}
      {error && <ErrorAlert message={error} />}

      <form onSubmit={handlePasswordChange} className="space-y-6">
        <FormInput
          id="currentPassword"
          label="当前密码"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          placeholder="输入当前密码"
          disabled={isChangingPassword}
        />
        <FormInput
          id="newPassword"
          label="新密码"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          placeholder="输入新密码（至少6个字符）"
          disabled={isChangingPassword}
        />
        <FormInput
          id="confirmPassword"
          label="确认新密码"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="再次输入新密码"
          disabled={isChangingPassword}
        />
        <div className={isMobile ? 'flex justify-center' : ''}>
          <SubmitButton loading={isChangingPassword} loadingText="修改中...">
            修改密码
          </SubmitButton>
        </div>
      </form>
    </>
  );
}
