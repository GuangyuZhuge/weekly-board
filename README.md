# 周任务看板

一个适合 2-3 人协同的小型项目进度管理网页雏形，功能聚焦：

- 首页展示本周任务
- 左右按钮切换周
- 新增任务并选择 1-3 位负责人
- 按负责人筛选任务
- 每条任务可勾选“是否完成”
- 多人访问同一个服务地址时共享同一份任务数据

## 启动方式

在项目目录执行：

```powershell
node .\server.js
```

启动后访问：`http://localhost:3000`

局域网多人协同时，可把 `localhost` 换成启动机器的局域网 IP（示例：`http://192.168.1.8:3000`）。

## Docker 部署

如果你要长期运行，建议直接用 Docker：

```bash
docker compose up -d --build
```

启动后访问：

- 本机：`http://127.0.0.1:3000`
- 局域网：`http://你的局域网IP:3000`

停止服务：

```bash
docker compose down
```

数据保存在项目目录的 `data/tasks.json`，容器重建后不会丢。

## 部署到外网

这个服务已经监听 `0.0.0.0:3000`，可以直接通过内网穿透映射到公网。推荐两种方式：

### 方式一：Cloudflare Tunnel

适合已有域名并托管到 Cloudflare 的场景。

1. 先启动服务：

```bash
docker compose up -d --build
```

2. 在宿主机安装并登录 `cloudflared`
3. 创建 tunnel，并把公网域名指向本地 `http://127.0.0.1:3000`
4. 外网访问你的域名即可

核心转发目标填写：

```text
http://127.0.0.1:3000
```

### 方式二：FRP

适合你自己有一台公网 Linux 服务器。

公网服务器 `frps.toml` 示例：

```toml
bindPort = 7000
```

内网机器 `frpc.toml` 示例：

```toml
serverAddr = "你的公网服务器IP"
serverPort = 7000

[[proxies]]
name = "task-board"
type = "tcp"
localIP = "127.0.0.1"
localPort = 3000
remotePort = 3000
```

完成后，外网可通过：

```text
http://你的公网服务器IP:3000
```

访问该系统。

### 安全建议

- 目前项目没有登录鉴权，不建议直接裸露到公网长期使用
- 如果要长期公网开放，至少加一层访问认证或放在受限的 Cloudflare Access 后面
- 如需 HTTPS，优先使用 Cloudflare Tunnel 或 Nginx + 证书反代

## 文件结构

- `index.html`：页面结构
- `styles.css`：页面样式
- `app.js`：前端交互和 API 调用
- `server.js`：静态资源 + 任务 API（无第三方依赖）
- `data/tasks.json`：任务持久化文件

## API（简版）

- `GET /api/members`：获取负责人列表
- `GET /api/tasks`：获取所有任务
- `POST /api/tasks`：新增任务
- `PATCH /api/tasks/:id`：更新任务（当前用于切换完成状态）
- `DELETE /api/tasks/:id`：删除任务

## 可继续扩展

- 增加任务状态、优先级、截止时间
- 支持自定义成员名单与成员管理
- 增加任务编辑、拖拽调整和权限控制
