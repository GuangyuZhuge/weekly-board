# 维护指南

项目目录：

```text
/home/ZGGY/weekly-board
```

## 结构

- `server.js`：Node 服务，负责静态页面、任务 API、企微 webhook 通知
- `app.js`：前端交互，包含按周同步、弹窗编辑、自动刷新
- `styles.css`：页面样式，已适配桌面和手机竖屏
- `compose.yaml`：任务看板容器
- `compose.sakurafrp.yaml`：SakuraFrp 隧道容器
- `data/tasks.json`：任务持久化数据
- `deploy/systemd/*.service`：开机自启服务定义

## 日常操作

重建并更新服务：

```bash
cd /home/ZGGY/weekly-board
docker compose up -d --build
docker compose -f compose.sakurafrp.yaml up -d
```

查看容器状态：

```bash
docker ps
docker logs --tail=100 weekly-task-board
docker logs --tail=100 weekly-task-board-frp
```

查看 systemd 状态：

```bash
systemctl status weekly-task-board.service
systemctl status weekly-task-board-frp.service
```

## 关键行为

- 前端只同步“当前显示的周”
- 切换周会立刻刷新
- 页面隐藏时暂停自动同步，回到前台恢复
- 新增任务、修改任务、完成状态切换都会发企业微信机器人通知

企微 webhook 配置在：

- `server.js` 的 `WEBHOOK_URL`

## 常见修改点

修改成员：

- `server.js` 中的 `TEAM_MEMBERS`

修改同步频率：

- `app.js` 中的 `TASK_SYNC_INTERVAL_MS`

修改隧道参数：

- `compose.sakurafrp.yaml`

修改开机自启：

- `deploy/systemd/weekly-task-board.service`
- `deploy/systemd/weekly-task-board-frp.service`

## 更新 systemd 配置

如果改了 `deploy/systemd/*.service`，需要重新安装：

```bash
sudo cp /home/ZGGY/weekly-board/deploy/systemd/weekly-task-board.service /etc/systemd/system/
sudo cp /home/ZGGY/weekly-board/deploy/systemd/weekly-task-board-frp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart weekly-task-board.service
sudo systemctl restart weekly-task-board-frp.service
```

## 数据备份

核心数据文件：

```text
/home/ZGGY/weekly-board/data/tasks.json
```

备份前建议先复制原文件：

```bash
cp /home/ZGGY/weekly-board/data/tasks.json /home/ZGGY/weekly-board/data/tasks.json.bak
```
