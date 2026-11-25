# Bimlink 软件版本 Skill

在 Kimi Code CLI 中通过自然语言新增 Bimlink 产品软件版本。支持自动登录、安装包分片上传、提交以及列表结果核对。

## 安装

需要 Node.js 22.20 或更高版本。

```bash
npx skills add Miao130526/aiotapk --skill bimlink-version -a kimi-code-cli -g
```

不加 `-g` 时仅安装到当前项目。

## 首次配置账号

账号密码不会保存在仓库中。请在运行 Kimi Code 的终端环境中配置：

macOS / Linux：

```bash
export BIMLINK_USERNAME='你的账号'
export BIMLINK_PASSWORD='你的密码'
```

Windows PowerShell：

```powershell
$env:BIMLINK_USERNAME='你的账号'
$env:BIMLINK_PASSWORD='你的密码'
```

如需长期使用，可将上述配置写入当前用户的 shell 配置或环境变量，不要提交到 Git。

## 在 Kimi Code 中使用

安装并配置环境变量后，直接输入：

```text
使用 bimlink-version 新增并提交软件版本：
产品编号：P00000277
版本：v1.0.0
版本编号：100
概要：修复设备在线状态显示问题
版本说明：修复离线状态同步问题，优化升级异常提示；升级前请备份配置。
版本类型：测试版本(完整)
安装包：/absolute/path/app-release.apk
提交后核对列表并告诉我记录序号。
```

## 直接运行脚本

全局安装后也可以直接执行：

```bash
node ~/.agents/skills/bimlink-version/scripts/bimlink_version.mjs \
  --product-id P00000277 \
  --version v1.0.0 \
  --version-code 100 \
  --summary '修复设备在线状态显示问题' \
  --release-note '修复离线状态同步问题，优化升级异常提示。' \
  --version-type 1 \
  --file /absolute/path/app-release.apk
```

版本类型：1=测试版本（完整），2=发布版本（完整），3=测试版本（增量升级），4=发布版本（增量升级），5=固件升级。

安装包必须真实存在且不超过 300 MiB。脚本成功时输出 JSON，包括上传文件 ID、提交响应和列表中的记录信息。

## 安全

- 不要提交真实密码、Cookie 或包含凭据的本地配置。
- 结果未知时不要盲目重复提交，应先检查软件版本列表。
- 建议先用允许测试的产品验证流程。
