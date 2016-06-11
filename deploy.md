install npm/node and add this systemd service

```
/etc/systemd/system/yunity-dev-sockets.service 
```

```
[Service]
ExecStart=/usr/bin/node /home/deploy/yunity-sockets -w 5090 -p 5091
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```
systemctl start yunity-dev-sockets
```
