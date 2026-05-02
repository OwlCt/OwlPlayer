# Security Policy

## 报告漏洞

如果您在 OwlPlayer 中发现安全漏洞，**请不要通过公开 issue 披露**。

请通过以下任一渠道私下联系：

- GitHub [Security Advisories](../../security/advisories)（推荐）
- 邮件：`security@owlc.uk`

报告中请包含：

- 漏洞类型与受影响版本
- 最小复现步骤 / PoC
- 您观察到的影响（信息泄漏 / 越权 / RCE 等）
- 建议的修复方向（如有）

我们会在 72 小时内回复确认收到，并在 14 天内给出处理时间表。

## 受支持的版本

| 版本    | 接受漏洞修复 |
| ------- | ------------ |
| 0.1.x   | ✅           |
| 0.0.x   | ❌（请升级） |

## 协调披露

- 在补丁发布前不公开漏洞细节
- 公开致谢上报者（除非您要求匿名）
- 严重漏洞通过 GitHub Security Advisory 发布 CVE
- 修复发布后约 7 天我们会在 release notes 中提及（不含 PoC 细节）

## 已知信任边界

设计上的非漏洞行为（请勿提交为安全问题）：

- 启用 Apple Music 增强后，`media-user-token` 以加密形式保存于数据库，由管理员可见——这是该功能必需的设计
- `SETUP_BOOTSTRAP_TOKEN` 仅在 `setup_status = needs_setup` 时有效，完成首次设置后失效
- 管理员账户拥有完整库管理与用户管理权限，没有更细粒度的角色拆分
