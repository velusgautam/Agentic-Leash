#!/bin/sh
# sudo -v first: a backgrounded sudo can't read the password prompt.
set -e
out=/tmp/es-60s.jsonl
sudo -v
sudo /usr/bin/eslogger fork exec exit open close create rename unlink write > "$out" &
echo "Recording for 60 s. Use any AI agent now."
sleep 60
sudo pkill -INT -x eslogger
wait
echo "lines: $(wc -l < "$out")"
ls -lh "$out"
