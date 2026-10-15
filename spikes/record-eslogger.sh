#!/bin/sh
# No `write`: eslogger logs its own output writes, a feedback loop (~80 MB/s).
# eslogger ignored SIGINT from pkill; alarm survives exec and ends it hard.
out=/tmp/es-60s.jsonl
echo "Recording for 60 s. Use any AI agent now."
sudo perl -e 'alarm 60; exec @ARGV' /usr/bin/eslogger fork exec exit open close create rename unlink > "$out"
echo "lines: $(wc -l < "$out")"
ls -lh "$out"
