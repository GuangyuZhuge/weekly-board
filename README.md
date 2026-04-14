# Weekly Board

一个轻量的周任务看板，面向 1-3 人协作，支持外网访问、手机竖屏浏览、企业微信机器人播报，以及按当前周自动同步。

仓库地址：`git@github.com:GuangyuZhuge/weekly-board.git`

## 当前能力

- 按周查看任务，顶部日期可点击回到当前周
- 点击任务列表空白处弹出“发布任务”
- 点击已有任务弹出“保存任务”并修改标题、日期、负责人、备注
- 任务列表支持按负责人筛选
- 任务可直接勾选完成
- 任务数据多人共享，写入 `data/tasks.json`
- 新增任务、修改任务、完成状态更新会发企业微信机器人通知
- 前端只同步当前显示的周，切换周立刻刷新
- 页面隐藏时暂停自动同步，恢复可见时再继续
- 已配置 Docker、SakuraFrp、systemd 开机自启

## 项目目录

```text
/home/ZGGY/weekly-board
```

## 核心文件

- `server.js`：Node HTTP 服务、任务 API、企业微信 webhook
- `app.js`：前端交互、弹窗、按周自动同步
- `styles.css`：桌面和手机样式
- `compose.yaml`：任务看板容器
- `compose.sakurafrp.yaml`：SakuraFrp 隧道容器
- `data/tasks.json`：任务持久化数据
- `deploy/systemd/*.service`：开机自启服务
- `MAINTENANCE.md`：给后续维护者的维护指南

## 本地运行

直接运行 Node：

```bash
cd /home/ZGGY/weekly-board
node server.js
```

访问：

```text
http://127.0.0.1:3000
```

## Docker 运行

```bash
cd /home/ZGGY/weekly-board
docker compose up -d --build
```

查看状态：

```bash
docker ps
docker logs --tail=100 weekly-task-board
```

停止：

```bash
docker compose down
```

## 外网访问

当前项目通过 SakuraFrp 暴露到外网。

启动隧道：

```bash
cd /home/ZGGY/weekly-board
docker compose -f compose.sakurafrp.yaml up -d
```

查看隧道日志：

```bash
docker logs --tail=100 weekly-task-board-frp
```

重启隧道：

```bash
docker restart weekly-task-board-frp
```

## 开机自启

当前使用 `systemd + Docker` 开机自启。

查看状态：

```bash
systemctl status weekly-task-board.service
systemctl status weekly-task-board-frp.service
```

如果修改了 service 文件，重新安装：

```bash
sudo cp /home/ZGGY/weekly-board/deploy/systemd/weekly-task-board.service /etc/systemd/system/
sudo cp /home/ZGGY/weekly-board/deploy/systemd/weekly-task-board-frp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart weekly-task-board.service
sudo systemctl restart weekly-task-board-frp.service
```

## 企业微信通知

服务端会在以下事件发生时发送企微机器人通知：

- 新增任务
- 修改任务
- 完成状态更新

Webhook 配置位置：

- `server.js` 中的 `WEBHOOK_URL`

## 自动同步策略

当前前端同步策略：

- 只同步当前显示的周
- 切换周时立即刷新
- 页面隐藏时暂停同步
- 页面恢复可见时立即同步一次
- 正在打开弹窗编辑时，不用后台轮询覆盖当前编辑过程

同步频率配置位置：

- `app.js` 中的 `TASK_SYNC_INTERVAL_MS`

## Android 包装

仓库中包含 Android WebView 包装工程：

- `android/`

注意：

- Android `build/` 产物已通过 `.gitignore` 忽略
- 如果要重新打包 APK，请在 `android/` 工程内按 Gradle 方式构建

## Git 同步

当前仓库已初始化并推送到 GitHub。

常用命令：

```bash
cd /home/ZGGY/weekly-board
git status
git add .
git commit -m "your message"
git push
```

## 维护

更详细的维护入口见：

- `MAINTENANCE.md`
