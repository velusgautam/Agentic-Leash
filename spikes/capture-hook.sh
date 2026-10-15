#!/bin/sh
mkdir -p /tmp/agentic-leash-capture
cat > "/tmp/agentic-leash-capture/$1-$2-$(date +%s)-$$.json"
[ "$1" = "cursor" ] && printf '{"permission":"allow"}'
exit 0
