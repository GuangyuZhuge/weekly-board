# SakuraFrp 隧道启动

这个项目的本地服务默认监听 `127.0.0.1:3000` / `0.0.0.0:3000`。

先启动业务服务：

```bash
cd /home/ZGGY/weekly-board
docker compose up -d --build
```

再启动 SakuraFrp 隧道：

```bash
cd /home/ZGGY/weekly-board
docker compose -f compose.sakurafrp.yaml up -d
```

查看日志：

```bash
docker logs weekly-task-board-frp
```

停止隧道：

```bash
docker compose -f compose.sakurafrp.yaml down
```
