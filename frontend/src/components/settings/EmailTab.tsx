import { useEmailTab } from './hooks';
import { useIsMobile } from '../../hooks/useIsMobile';
import { SuccessAlert, ErrorAlert, FormInput, SubmitButton } from './common';

export default function EmailTab() {
  const isMobile = useIsMobile();
  const {
    user,
    newEmail,
    setNewEmail,
    emailCode,
    setEmailCode,
    emailStep,
    isChangingEmail,
    error,
    success,
    handleRequestEmailChange,
    handleConfirmEmailChange,
    goBack,
  } = useEmailTab();

  if (!user) return null;

  return (
    <div className="space-y-6">
      {success && <SuccessAlert message={success} />}
      {error && <ErrorAlert message={error} />}

      {emailStep === 'request' ? (
        <form onSubmit={handleRequestEmailChange} className="space-y-6">
          <FormInput
            id="currentEmail"
            label="当前邮箱"
            value={user.email}
            readOnly
          />
          <FormInput
            id="newEmail"
            label="新邮箱地址"
            type="email"
            value={newEmail}
            onChange={setNewEmail}
            placeholder="输入新邮箱地址"
            disabled={isChangingEmail}
          />
          <div className={isMobile ? 'flex justify-center' : ''}>
            <SubmitButton loading={isChangingEmail} loadingText="发送中...">
              发送验证码
            </SubmitButton>
          </div>
        </form>
      ) : (
        <form onSubmit={handleConfirmEmailChange} className="space-y-6">
          <p className="text-white/60">
            验证码已发送到 <span className="text-white">{newEmail}</span>
          </p>
          <FormInput
            id="emailCode"
            label="验证码"
            value={emailCode}
            onChange={setEmailCode}
            placeholder="输入6位验证码"
            maxLength={6}
            disabled={isChangingEmail}
          />
          <div className={`flex gap-4 ${isMobile ? 'justify-center' : ''}`}>
            <SubmitButton loading={isChangingEmail} loadingText="验证中...">
              确认修改
            </SubmitButton>
            <SubmitButton type="button" variant="secondary" onClick={goBack}>
              返回
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
