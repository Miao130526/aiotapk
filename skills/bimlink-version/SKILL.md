---
name: bimlink-version
description: 新增或发布 Bimlink 产品软件版本。用户提供产品 P 编号、版本、版本编号、概要、版本说明和本地安装包时使用；支持自动登录、分片上传、提交和列表核对。
---

# Bimlink 新增软件版本

使用本目录的 `scripts/bimlink_version.mjs` 完成操作。脚本仅依赖 Node.js 内置模块，不需要浏览器或 npm install。

## 输入

必须取得：

- `productId`：产品 P 编号，例如 `P00000277`
- `version`：版本名称，例如 `v1.0.0`
- `versionCode`：纯数字累加版本编号，例如 `100`
- `summary`：概要
- `releaseNote`：版本说明
- `file`：真实存在的本地安装包绝对路径，最大 300 MiB

可选：`versionType` 默认 `1`，`hardware` 默认空字符串。版本类型映射：1=测试版本（完整），2=发布版本（完整），3=测试版本（增量升级），4=发布版本（增量升级），5=固件升级。

缺少必要输入时只询问缺失项，不要猜测版本号或安装包路径。

## 凭据

脚本读取 `BIMLINK_USERNAME` 和 `BIMLINK_PASSWORD`。若未配置，指导用户在当前终端设置环境变量后再运行；不要把密码写入仓库、SKILL.md、请求 JSON 或聊天记录。默认站点为 `https://aiot.aibims.com`，可用 `BIMLINK_BASE_URL` 覆盖。

## 执行

将本 SKILL.md 所在目录记为 `SKILL_DIR`。先检查 Node.js 为 22.20 或更高版本。

为避免多行版本说明和 shell 引号问题，优先在临时目录创建请求 JSON：

```json
{
  "productId": "P00000277",
  "version": "v1.0.0",
  "versionCode": "100",
  "summary": "修复设备在线状态显示问题",
  "releaseNote": "修复离线状态同步问题。\n优化升级异常提示。",
  "versionType": "1",
  "hardware": "",
  "file": "/absolute/path/app-release.apk"
}
```

然后执行：

```bash
node "$SKILL_DIR/scripts/bimlink_version.mjs" --input /absolute/path/request.json
```

也支持同名命令行参数：`--product-id`、`--version`、`--version-code`、`--summary`、`--release-note`、`--version-type`、`--hardware`、`--file`。命令行参数覆盖 JSON。

仅检查环境和登录、不上传也不新增记录时：

```bash
node "$SKILL_DIR/scripts/bimlink_version.mjs" --check-only
```

## 结果

成功时脚本向 stdout 输出 JSON，包含 `fileId`、`submitResponse` 和 `record`。将记录序号、产品和版本报告给用户。失败时退出码非零，stderr 给出阶段和原因。

如果提交请求已发出但结果不确定，先打开或请求软件版本列表核对，不要直接重试，以免重复新增。只有明确未提交时才可重试。
