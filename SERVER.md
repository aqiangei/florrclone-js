# 本地联机服务端（protocol 3，首版）

运维和发布方式见 [DEPLOYMENT.md](DEPLOYMENT.md)。

在项目根目录执行：

```powershell
npm start
```

打开 http://127.0.0.1:8787 ，点击 Ready → Register 注册账号后联机。新账号一次性获得随机共 **20 个 Super（rarity 7）花瓣**，可重复抽到同种；仅从该品质可用的普通花瓣中抽取，不发特殊奖励道具。所有账号都是普通玩家，不启用 Admin/Debug。重复登录不补发。

两个独立浏览器可以登录不同账号。同一账号后开的连接会替换前一个连接。默认仅监听本机；局域网访问可先设置 `$env:HOST='0.0.0.0'`。`PORT`、`WEB_ROOT`、`DB_PATH` 可通过环境变量覆盖。

## 已实现

- 同源静态镜像、`GET /api/session`、`GET /api/account`、`GET /api/health` 和 `/ws`。
- 用户名密码注册/登录/退出、服务端会话、同一身份重复连接替换、退出保存、10 秒自动保存、重启恢复；存档默认 `data/inventory.json`。密码采用带随机盐的 scrypt 哈希。旧游客存档留在数据库，新的注册账号使用独立存档和注册奖励。
- 按 biome 共享 Adventure 房间；服务端 tick、输入序号确认、停止输入超时、多人位置和花瓣、共享怪物、战斗和归属掉落；装备、天赋、商店与合成使用镜像中的游戏逻辑。
- JSON 完整快照；协商 `florr-batch-v1` / `florr-delta-v1` 后发送 gzip JSON 完整快照。这两种客户端 decoder 都原生接受对象快照；当前不编码 batch/delta 数组。没有协商子协议时发送文本 JSON。
- 输入使用客户端原有严格 schema 校验；同源 WebSocket 检查、消息大小和速率限制、慢连接断开。
- 存档仅变化时发送，避免每帧触发客户端的库存 UI 更新和花瓣重建。30Hz tick 与 20Hz 快照独立调度；gzip 和落盘使用异步任务；慢客户端不积压压缩队列。花瓣使用有缓冲的逐帧插值，伤害数字、花瓣破碎和怪物死亡反馈均由服务端发送；多人重叠由服务端结算碰撞，避免客户端修正位置后又被快照拉回。视野外怪物减少仿真，`/api/health` 提供 tick 耗时与快照/存档发送次数。

## 实现来源和边界

`server/engine.js` 在 Node VM 中加载已镜像客户端内的仿真和 schema，固定文件 SHA-256。React 导入在这个运行环境中是惰性占位；不执行浏览器渲染。升级客户端需要重新审查提取边界并通过测试。服务端不使用参考项目的 `server.wasm` 或线协议，也没有复制其 C++ 源码。

`server/client-patches.js` 在发送客户端脚本时增加快照记录和花瓣插值钩子；具体播放逻辑在 `server/client-motion.js`。磁盘中的镜像保持原始内容，服务端提取引擎的哈希不变。显示参考 `florr_clone-web` 的延迟缓冲和帧间平滑思路，网络频率参考其独立的 30Hz 仿真 / 20Hz 快照调度。显示插值不计算战斗伤害。

这是可运行的 Adventure 最小联机服。没有实现改名、Wave/组队、公会、吸收和管理系统。复杂怪物特殊行为和各类花瓣组合仍需持续场景回归。不能将这份实现视为原站后端的完整还原。

## 一键打包

```powershell
npm run build
node dist/start.js
```

`dist` 包含静态站、服务端 JS 和 `ws` 运行依赖。将整个目录复制到已安装 Node.js 22+ 的机器即可运行，不需要 wasm、编译器或再次安装 npm 包。存档位于 `dist/data/inventory.json`，重新打包保留此目录。构建仅复制运行文件，后续如删除源文件应使用新的输出目录打包，避免旧文件残留。外部访问和 HTTPS 可通过反向代理转发同源 HTTP 与 WebSocket。

## 验证

```powershell
npm test
npm run test:browser
npm run test:combat
```

协议测试覆盖真实双 WebSocket、gzip、客户端 schema、跨玩家移动、存档、非法命令和未认证连接。浏览器测试使用已安装 Chrome 的两个独立上下文，从原始镜像页面点击 Ready，检查游戏状态、键盘移动、浏览器错误和资源请求，并输出 `test-results/online-playing.png`。

战斗回归覆盖近战扣血、伤害数字、死亡、击杀/掉落归属、其他玩家拥有仿真权时的攻击，以及多人重叠碰撞。`test:combat` 从真实页面按攻击键验证扣血和伤害数字，并对照原始客户端与修复后的花瓣逐帧运动；报告为 `test-results/combat-motion-report.json`，截图为 `test-results/combat-feedback.png`。

`scripts/check-upstream.js` 是显式运行的原站对照工具：通过 `GAME_USER`、`GAME_PASS` 环境变量提供凭据；`WS_COMPRESSED=1` 可检查协商后的 gzip/batch 快照。只登录并读取 4 秒大厅快照，不开始游戏或操作资产。密码、Cookie 和完整存档不写入报告。报告只包含字段名、协议、速率和地图尺寸，位于 `test-results/upstream-parity*.json`。
