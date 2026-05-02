package services

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"html/template"
	"net/smtp"
	"strings"
	"sync"
)

// EmailConfig holds SMTP email configuration
type EmailConfig struct {
	SMTPHost     string `yaml:"smtp-host" json:"smtp_host"`
	SMTPPort     int    `yaml:"smtp-port" json:"smtp_port"`
	SMTPUser     string `yaml:"smtp-user" json:"smtp_user"`
	SMTPPassword string `yaml:"smtp-password" json:"smtp_password"`
	FromAddress  string `yaml:"from-address" json:"from_address"`
	FromName     string `yaml:"from-name" json:"from_name"`
	UseTLS       bool   `yaml:"use-tls" json:"use_tls"`
}

// EmailService handles sending emails
type EmailService struct {
	mu      sync.RWMutex
	config  *EmailConfig
	LogoURL string // Public URL for the logo image in emails
}

// NewEmailService creates a new EmailService instance
func NewEmailService(config *EmailConfig) *EmailService {
	return &EmailService{
		config:  cloneEmailConfig(config),
		LogoURL: "/OwlPlayer-200x200.png",
	}
}

func cloneEmailConfig(config *EmailConfig) *EmailConfig {
	if config == nil {
		return nil
	}
	cloned := *config
	return &cloned
}

// UpdateConfig replaces the current runtime email configuration.
func (s *EmailService) UpdateConfig(config *EmailConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.config = cloneEmailConfig(config)
}

// GetConfig returns a copy of the current runtime email configuration.
func (s *EmailService) GetConfig() *EmailConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneEmailConfig(s.config)
}

// IsConfigured returns whether the email service is properly configured
func (s *EmailService) IsConfigured() bool {
	config := s.GetConfig()
	return config != nil && config.SMTPHost != "" && config.FromAddress != ""
}

// =============================================================================
// Email Templates
// =============================================================================

// emailBaseStyle contains shared CSS styles for all email templates
const emailBaseStyle = `
<style>
    body { margin: 0; padding: 0; background-color: #f0f2f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { padding: 32px 40px; text-align: center; }
    .logo { width: 48px; height: 48px; border-radius: 12px; margin-bottom: 12px; }
    .brand { font-size: 18px; font-weight: 700; color: #ffffff; letter-spacing: 1px; margin: 0; }
    .title { font-size: 22px; font-weight: 700; color: #ffffff; margin: 16px 0 0 0; }
    .body-content { padding: 36px 40px; }
    .greeting { font-size: 16px; color: #1a1a1a; margin: 0 0 16px 0; line-height: 1.6; }
    .desc { font-size: 15px; color: #4a4a4a; margin: 0 0 24px 0; line-height: 1.6; }
    .code-box { background: #f8f9fa; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px 0; }
    .code { font-size: 36px; font-weight: 800; letter-spacing: 10px; font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; }
    .hint { font-size: 13px; color: #8c8c8c; margin: 0 0 8px 0; line-height: 1.6; }
    .divider { border: none; border-top: 1px solid #f0f0f0; margin: 24px 0; }
    .footer { text-align: center; padding: 0 40px 32px 40px; }
    .footer-text { font-size: 12px; color: #bfbfbf; margin: 0; line-height: 1.6; }
    .highlight-box { background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 12px; padding: 20px 24px; text-align: center; margin: 0 0 24px 0; }
    .highlight-text { font-size: 16px; color: #52c41a; margin: 0; font-weight: 600; }
</style>`

const verificationEmailTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>邮箱验证</title>` + emailBaseStyle + `
</head>
<body>
    <div class="wrapper">
        <div class="card">
            <div class="header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                <img src="{{.LogoURL}}" alt="OwlPlayer" class="logo">
                <p class="brand">OwlPlayer</p>
                <h1 class="title">📧 邮箱验证</h1>
            </div>
            <div class="body-content">
                <p class="greeting">您好，</p>
                <p class="desc">感谢您注册 OwlPlayer，请使用以下验证码完成邮箱验证：</p>
                <div class="code-box">
                    <span class="code" style="color: #667eea;">{{.Code}}</span>
                </div>
                <p class="hint">⏱ 验证码将在 <strong>10 分钟</strong>后过期，请尽快使用。</p>
                <p class="hint">如果您没有注册 OwlPlayer 账号，请忽略此邮件。</p>
                <hr class="divider">
            </div>
            <div class="footer">
                <p class="footer-text">此邮件由系统自动发送，请勿直接回复。</p>
                <p class="footer-text">© OwlPlayer · Music for everyone</p>
            </div>
        </div>
    </div>
</body>
</html>`

const emailChangeTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>更换邮箱验证</title>` + emailBaseStyle + `
</head>
<body>
    <div class="wrapper">
        <div class="card">
            <div class="header" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                <img src="{{.LogoURL}}" alt="OwlPlayer" class="logo">
                <p class="brand">OwlPlayer</p>
                <h1 class="title">✉️ 更换邮箱</h1>
            </div>
            <div class="body-content">
                <p class="greeting">您好，</p>
                <p class="desc">您正在更换账号绑定的邮箱地址，请使用以下验证码确认操作：</p>
                <div class="code-box">
                    <span class="code" style="color: #f5576c;">{{.Code}}</span>
                </div>
                <p class="hint">⏱ 验证码将在 <strong>10 分钟</strong>后过期，请尽快使用。</p>
                <p class="hint">⚠️ 如果您没有发起此操作，请立即检查账号安全。</p>
                <hr class="divider">
            </div>
            <div class="footer">
                <p class="footer-text">此邮件由系统自动发送，请勿直接回复。</p>
                <p class="footer-text">© OwlPlayer · Music for everyone</p>
            </div>
        </div>
    </div>
</body>
</html>`

const activationNotificationTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>账号已激活</title>` + emailBaseStyle + `
</head>
<body>
    <div class="wrapper">
        <div class="card">
            <div class="header" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);">
                <img src="{{.LogoURL}}" alt="OwlPlayer" class="logo">
                <p class="brand">OwlPlayer</p>
                <h1 class="title">🎉 账号已激活</h1>
            </div>
            <div class="body-content">
                <p class="greeting">您好，</p>
                <p class="desc">好消息！管理员已激活您的 OwlPlayer 账号，您现在可以使用所有功能了。</p>
                <div class="highlight-box">
                    <p class="highlight-text">🎵 开始探索您喜爱的音乐吧！</p>
                </div>
                <p class="hint">登录后即可畅享音乐、歌词同步等全部功能。</p>
                <hr class="divider">
            </div>
            <div class="footer">
                <p class="footer-text">此邮件由系统自动发送，请勿直接回复。</p>
                <p class="footer-text">© OwlPlayer · Music for everyone</p>
            </div>
        </div>
    </div>
</body>
</html>`

const passwordResetTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>密码重置</title>` + emailBaseStyle + `
</head>
<body>
    <div class="wrapper">
        <div class="card">
            <div class="header" style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);">
                <img src="{{.LogoURL}}" alt="OwlPlayer" class="logo">
                <p class="brand">OwlPlayer</p>
                <h1 class="title">🔐 密码重置</h1>
            </div>
            <div class="body-content">
                <p class="greeting">您好，</p>
                <p class="desc">您正在重置 OwlPlayer 账户密码，请使用以下验证码完成操作：</p>
                <div class="code-box">
                    <span class="code" style="color: #ee5a24;">{{.Code}}</span>
                </div>
                <p class="hint">⏱ 验证码将在 <strong>10 分钟</strong>后过期，请尽快使用。</p>
                <p class="hint">⚠️ 如果您没有请求重置密码，请忽略此邮件并确保账户安全。</p>
                <hr class="divider">
            </div>
            <div class="footer">
                <p class="footer-text">此邮件由系统自动发送，请勿直接回复。</p>
                <p class="footer-text">© OwlPlayer · Music for everyone</p>
            </div>
        </div>
    </div>
</body>
</html>`

const emailLoginTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>登录验证</title>` + emailBaseStyle + `
</head>
<body>
    <div class="wrapper">
        <div class="card">
            <div class="header" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
                <img src="{{.LogoURL}}" alt="OwlPlayer" class="logo">
                <p class="brand">OwlPlayer</p>
                <h1 class="title">🔑 登录验证</h1>
            </div>
            <div class="body-content">
                <p class="greeting">您好，</p>
                <p class="desc">您正在使用邮箱验证码登录 OwlPlayer，请使用以下验证码：</p>
                <div class="code-box">
                    <span class="code" style="color: #4facfe;">{{.Code}}</span>
                </div>
                <p class="hint">⏱ 验证码将在 <strong>10 分钟</strong>后过期，请尽快使用。</p>
                <p class="hint">如果您没有请求此验证码，请忽略此邮件。</p>
                <hr class="divider">
            </div>
            <div class="footer">
                <p class="footer-text">此邮件由系统自动发送，请勿直接回复。</p>
                <p class="footer-text">© OwlPlayer · Music for everyone</p>
            </div>
        </div>
    </div>
</body>
</html>`

// =============================================================================
// Email Sending Methods
// =============================================================================

// SendVerificationCode sends a verification code to the specified email
func (s *EmailService) SendVerificationCode(ctx context.Context, email, code string) error {
	if !s.IsConfigured() {
		// Development mode: just log the code
		fmt.Printf("[EMAIL] Verification code for %s: %s\n", email, code)
		return nil
	}

	subject := "OwlPlayer 邮箱验证码"
	body, err := s.renderTemplate(verificationEmailTemplate, map[string]string{"Code": code, "LogoURL": s.LogoURL})
	if err != nil {
		return fmt.Errorf("failed to render email template: %w", err)
	}

	return s.sendEmail(ctx, email, subject, body)
}

// SendEmailChangeCode sends a verification code for email change
func (s *EmailService) SendEmailChangeCode(ctx context.Context, email, code string) error {
	if !s.IsConfigured() {
		// Development mode: just log the code
		fmt.Printf("[EMAIL] Email change code for %s: %s\n", email, code)
		return nil
	}

	subject := "OwlPlayer 更换邮箱验证码"
	body, err := s.renderTemplate(emailChangeTemplate, map[string]string{"Code": code, "LogoURL": s.LogoURL})
	if err != nil {
		return fmt.Errorf("failed to render email template: %w", err)
	}

	return s.sendEmail(ctx, email, subject, body)
}

// SendActivationNotification sends a notification that the account has been activated
func (s *EmailService) SendActivationNotification(ctx context.Context, email string) error {
	if !s.IsConfigured() {
		// Development mode: just log
		fmt.Printf("[EMAIL] Activation notification sent to %s\n", email)
		return nil
	}

	subject := "OwlPlayer 账号已激活"
	body, err := s.renderTemplate(activationNotificationTemplate, map[string]string{"LogoURL": s.LogoURL})
	if err != nil {
		return fmt.Errorf("failed to render email template: %w", err)
	}

	return s.sendEmail(ctx, email, subject, body)
}

// SendPasswordResetCode sends a password reset verification code
func (s *EmailService) SendPasswordResetCode(ctx context.Context, email, code string) error {
	if !s.IsConfigured() {
		// Development mode: just log the code
		fmt.Printf("[EMAIL] Password reset code for %s: %s\n", email, code)
		return nil
	}

	subject := "OwlPlayer 密码重置验证码"
	body, err := s.renderTemplate(passwordResetTemplate, map[string]string{"Code": code, "LogoURL": s.LogoURL})
	if err != nil {
		return fmt.Errorf("failed to render email template: %w", err)
	}

	return s.sendEmail(ctx, email, subject, body)
}

// SendLoginCode sends a login verification code
func (s *EmailService) SendLoginCode(ctx context.Context, email, code string) error {
	if !s.IsConfigured() {
		// Development mode: just log the code
		fmt.Printf("[EMAIL] Login code for %s: %s\n", email, code)
		return nil
	}

	subject := "OwlPlayer 登录验证码"
	body, err := s.renderTemplate(emailLoginTemplate, map[string]string{"Code": code, "LogoURL": s.LogoURL})
	if err != nil {
		return fmt.Errorf("failed to render email template: %w", err)
	}

	return s.sendEmail(ctx, email, subject, body)
}

// =============================================================================
// Internal Methods
// =============================================================================

// renderTemplate renders an HTML template with the given data
func (s *EmailService) renderTemplate(templateStr string, data interface{}) (string, error) {
	tmpl, err := template.New("email").Parse(templateStr)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}

	return buf.String(), nil
}

// sendEmail sends an email using SMTP
func (s *EmailService) sendEmail(ctx context.Context, to, subject, htmlBody string) error {
	config := s.GetConfig()
	if config == nil {
		return fmt.Errorf("email service is not configured")
	}

	// Build email headers
	from := config.FromAddress
	if config.FromName != "" {
		from = fmt.Sprintf("%s <%s>", config.FromName, config.FromAddress)
	}

	headers := make(map[string]string)
	headers["From"] = from
	headers["To"] = to
	headers["Subject"] = subject
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = "text/html; charset=UTF-8"

	// Build message
	var msg strings.Builder
	for k, v := range headers {
		msg.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	msg.WriteString("\r\n")
	msg.WriteString(htmlBody)

	// Connect to SMTP server
	addr := fmt.Sprintf("%s:%d", config.SMTPHost, config.SMTPPort)

	var auth smtp.Auth
	if config.SMTPUser != "" && config.SMTPPassword != "" {
		auth = smtp.PlainAuth("", config.SMTPUser, config.SMTPPassword, config.SMTPHost)
	}

	// Port 465 uses implicit TLS (SSL)
	if config.SMTPPort == 465 {
		return s.sendEmailTLS(config, addr, auth, config.FromAddress, to, []byte(msg.String()))
	}

	// Port 587 typically uses STARTTLS
	if config.SMTPPort == 587 {
		return s.sendEmailSTARTTLS(config, addr, config.FromAddress, to, []byte(msg.String()))
	}

	// Send email with TLS if configured
	if config.UseTLS {
		return s.sendEmailTLS(config, addr, auth, config.FromAddress, to, []byte(msg.String()))
	}

	// Send email without TLS
	return smtp.SendMail(addr, auth, config.FromAddress, []string{to}, []byte(msg.String()))
}

// sendEmailSTARTTLS sends an email using STARTTLS (port 587)
func (s *EmailService) sendEmailSTARTTLS(config *EmailConfig, addr string, from, to string, msg []byte) error {
	// Connect to server
	client, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("failed to connect to SMTP server: %w", err)
	}
	defer client.Close()

	// Send STARTTLS command
	tlsConfig := &tls.Config{
		ServerName: config.SMTPHost,
	}
	if err := client.StartTLS(tlsConfig); err != nil {
		return fmt.Errorf("STARTTLS failed: %w", err)
	}

	// Authenticate
	if config.SMTPUser != "" && config.SMTPPassword != "" {
		auth := smtp.PlainAuth("", config.SMTPUser, config.SMTPPassword, config.SMTPHost)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP authentication failed: %w", err)
		}
	}

	// Set sender
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("failed to set sender: %w", err)
	}

	// Set recipient
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("failed to set recipient: %w", err)
	}

	// Send message body
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("failed to get data writer: %w", err)
	}

	_, err = w.Write(msg)
	if err != nil {
		return fmt.Errorf("failed to write message: %w", err)
	}

	err = w.Close()
	if err != nil {
		return fmt.Errorf("failed to close data writer: %w", err)
	}

	return client.Quit()
}

// sendEmailTLS sends an email using TLS connection
func (s *EmailService) sendEmailTLS(config *EmailConfig, addr string, auth smtp.Auth, from, to string, msg []byte) error {
	// Create TLS config
	tlsConfig := &tls.Config{
		ServerName: config.SMTPHost,
	}

	// Connect to server
	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("failed to connect to SMTP server: %w", err)
	}
	defer conn.Close()

	// Create SMTP client
	client, err := smtp.NewClient(conn, config.SMTPHost)
	if err != nil {
		return fmt.Errorf("failed to create SMTP client: %w", err)
	}
	defer client.Close()

	// Authenticate if credentials provided
	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP authentication failed: %w", err)
		}
	}

	// Set sender
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("failed to set sender: %w", err)
	}

	// Set recipient
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("failed to set recipient: %w", err)
	}

	// Send message body
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("failed to get data writer: %w", err)
	}

	_, err = w.Write(msg)
	if err != nil {
		return fmt.Errorf("failed to write message: %w", err)
	}

	err = w.Close()
	if err != nil {
		return fmt.Errorf("failed to close data writer: %w", err)
	}

	return client.Quit()
}
