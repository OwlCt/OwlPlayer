# Contributing to OwlPlayer

感谢关注 OwlPlayer。这是一个 v0.1 早期项目，欢迎 issue 与 PR，但请先阅读以下约定。

## 报告 Bug

提交前请：

- 在已有 issue 中搜索是否重复
- 在最新 `master` 分支上复现
- 提供：复现步骤、OS、浏览器、相关日志（请脱敏）、是否启用了 Apple Music 增强

## 提交 PR

1. Fork + clone
2. 从 `master` 切出 feature 分支：`git checkout -b feat/your-feature`
3. 本地通过测试
4. 提交时遵循下方 Commit 规范
5. push 到你的 fork，PR 指向上游 `master`

PR 描述请说明：

- 背景与动机
- 主要改动
- 测试方法（截图 / 命令输出）
- 涉及的破坏性变更
- 是否需要数据库迁移 / 运行期设置变更

## Commit 规范

使用 Conventional Commits 前缀：

- `feat:` 新功能
- `fix:` Bug 修复
- `refactor:` 不改变功能的重构
- `perf:` 性能优化
- `test:` 测试相关
- `docs:` 文档
- `chore:` 杂项（依赖、构建、CI）

示例：`feat(player): add gapless playback`

## 代码风格

**Go**

- `gofmt` 必须通过
- 包名小写短词；导出符号 `CamelCase`
- 数据库操作**必须**使用参数化查询（`$1, $2`），禁止字符串拼接拼 SQL
- 用户数据隔离：每个 library / playlist / history 操作必须按 JWT 上下文中的 user_id 过滤，不信任请求体里的 user_id

**前端**

- TypeScript + React 18，函数组件 + hooks
- 组件 `PascalCase`；hooks / stores / utils `camelCase`
- 提交前跑 `npm run lint` 和 `npx tsc --noEmit`
- 共享类型放 `frontend/src/types/index.ts`

## 测试

- 后端：`go test ./...`。新增业务逻辑请配套 `*_test.go`；不变量类（队列 / 解析 / 状态机）建议用 `gopter` 或 `rapid` 写 `*_prop_test.go`
- 前端：`npm test -- --run`。组件 / store 改动请同步更新 `*.test.ts(x)` 或 `*.prop.test.ts(x)`
- 涉及播放、缓存、离线下载等关键路径请在浏览器实机验证

## 不接收的 PR

- 引入对 Apple Music / Spotify / Tidal 等闭源或受限 API 的更深耦合（现有 `utils/ampapi/` 不再扩展）
- 内联 base64 二进制资源
- 没有提前在 issue 中讨论的大幅重构
- 与项目目标无关的纯代码风格调整

## 开发者证书 / 许可

提交 PR 即视为您同意以 [AGPL-3.0](LICENSE) 发布您的贡献，并确认您拥有提交内容的版权或已获授权。
