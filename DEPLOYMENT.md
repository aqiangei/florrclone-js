# 部署

将构建产物发布到 Linux 主机（Nginx 反代 + systemd）。本仓库不包含真实主机地址或 SSH 私钥；用环境变量配置。

| 项目 | 配置 |
|---|---|
| 公网入口 | `http://<DEPLOY_HOST>:<DEPLOY_PUBLIC_PORT>/`（默认端口 8088） |
| Nginx 入口 | TCP 8088 |
| Node 后端 | `127.0.0.1:8788`，仅本机访问 |
| 服务 | `florrclone.service`，开机自启，异常退出自动重启 |
| 运行用户 | `florrclone`，普通系统用户 |
| 运行时 | 独立 Node 22 LTS，`/opt/florrclone/runtime/bin/node`；官方 SHA-256 校验 |
| 当前版本链接 | `/opt/florrclone/current` |
| 版本目录 | `/opt/florrclone/releases/<UTC版本号>` |
| 存档 | `/var/lib/florrclone/inventory.json`，目录 0700、文件 0600 |
| 应用资源限制 | 2GB 内存、2 核 CPU 配额 |
| Nginx 配置 | `/etc/nginx/conf.d/florrclone.conf` |

## 环境变量

| 变量 | 说明 |
|---|---|
| `DEPLOY_HOST` | 目标主机名或 IP（必填） |
| `DEPLOY_USER` | SSH 用户，默认 `root` |
| `DEPLOY_SSH_KEY` | 私钥路径，默认 `%USERPROFILE%/.ssh/id_ed25519` |
| `DEPLOY_PUBLIC_PORT` | 公网端口，默认 `8088` |
| `PRESERVE_UNIT` | （可选，装机脚本）部署前后须保持不变的其它 systemd 单元名 |
| `TARGET_URL` | （验收）例如 `http://127.0.0.1:8088/` |
| `LEGACY_URL` | （可选验收）同机其它站点健康检查 URL |

私钥只放在本机 SSH 目录，不要提交到仓库。

## 更新

在本项目根目录用 PowerShell 7：

```powershell
$env:DEPLOY_HOST = 'your.server.example'
# $env:DEPLOY_SSH_KEY = "$env:USERPROFILE\.ssh\your-key"
./scripts/deploy-hk161.ps1
```

脚本重新构建并打包应用代码、静态文件、运行依赖和部署配置，经 SSH 上传，校验归档 SHA-256，检查引擎初始化后切换 `current` 链接。存档始终放在版本目录外。每次只重启 `florrclone`，Nginx 热加载；部署失败可回退应用链接和配置。

首次部署可用 `-SkipLocalAccounts` 跳过导入本地账号。`-SkipBuild` 直接使用上一次生成的 `dist`。

## 检查和日志

```bash
systemctl status florrclone
journalctl -u florrclone -n 80 --no-pager
curl -fsS http://127.0.0.1:8788/api/health
curl -fsS http://127.0.0.1:8088/api/health
```

公网验收：

```powershell
$env:TARGET_URL = 'http://your.server.example:8088/'
node scripts/verify-public.js
```

该工具创建临时验证账号（普通玩家，每个账号首次注册获得随机共 20 个 Super 花瓣），验证同房互相可见、移动序号确认和 gzip 快照；再用 Chrome 打开网页检查资源和脚本错误。密码只在测试进程内生成和使用，不写入报告。

验证报告：`test-results/public-deployment-check.json`（本地，已 gitignore）。
