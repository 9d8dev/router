#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUTPUT_DIR="$SCRIPT_DIR/dist"
PUBLIC_OUTPUT_DIR="$SCRIPT_DIR/../../public/downloads"
mkdir -p "$OUTPUT_DIR" "$PUBLIC_OUTPUT_DIR"
rm -f "$OUTPUT_DIR/router-forms.zip"
cd "$SCRIPT_DIR"
zip -qr "$OUTPUT_DIR/router-forms.zip" router-forms -x '*.DS_Store'
cp "$OUTPUT_DIR/router-forms.zip" "$PUBLIC_OUTPUT_DIR/router-forms.zip"
echo "$OUTPUT_DIR/router-forms.zip"
