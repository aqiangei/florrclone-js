# florrclone

本地权威联机服务端（protocol 3）：用已镜像的客户端逻辑跑 Adventure 多人房，支持账号注册/登录与存档。

## 快速开始

```powershell
npm install
npm start
```

浏览器打开 http://127.0.0.1:8787 ，Ready → Register。细节见 [SERVER.md](SERVER.md)，部署见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 测试

```powershell
npm test
npm run test:browser
npm run test:combat
```

## 注意

- `data/`、`dist/data/` 与浏览器登录配置含会话和密码哈希，已在 `.gitignore` 中排除，请勿提交。
- 部署主机、SSH 私钥请用环境变量配置，不要写进仓库。
- 上游对照 / 抓包脚本需要自行设置 `GAME_USER`、`GAME_PASS`，仓库内不保存真实凭据。
