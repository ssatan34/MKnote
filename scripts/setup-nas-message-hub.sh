#!/bin/sh
# 在绿联 NAS 上初始化短消息 JSON（对应 WebDAV 路径 /MDnote/messages.json）
set -eu
DIR='/volume1/共享文件/MDnote'
FILE="$DIR/messages.json"
mkdir -p "$DIR"
if [ -f "$FILE" ]; then
  echo "已存在: $FILE"
  ls -la "$FILE"
  exit 0
fi
printf '%s\n' '{"version":1,"messages":[]}' > "$FILE"
chmod 664 "$FILE" 2>/dev/null || true
echo "已创建: $FILE"
ls -la "$DIR/"
