启用开机自启：

```bash
sudo cp /home/ZGGY/weekly-board/deploy/systemd/weekly-task-board.service /etc/systemd/system/
sudo cp /home/ZGGY/weekly-board/deploy/systemd/weekly-task-board-frp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable docker
sudo systemctl enable weekly-task-board.service
sudo systemctl enable weekly-task-board-frp.service
sudo systemctl start weekly-task-board.service
sudo systemctl start weekly-task-board-frp.service
```

查看状态：

```bash
systemctl status weekly-task-board.service
systemctl status weekly-task-board-frp.service
docker ps
```
