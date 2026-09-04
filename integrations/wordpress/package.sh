#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUTPUT_DIR="${ROUTER_FORMS_OUTPUT_DIR:-$SCRIPT_DIR/dist}"
PUBLIC_OUTPUT_DIR="$SCRIPT_DIR/../../public/downloads"
mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR/router-forms.zip"
cd "$SCRIPT_DIR"
zip -qr "$OUTPUT_DIR/router-forms.zip" router-forms -x '*.DS_Store'
if [ "${ROUTER_FORMS_PUBLISH_DOWNLOAD:-true}" = "true" ]; then
  mkdir -p "$PUBLIC_OUTPUT_DIR"
  cp "$OUTPUT_DIR/router-forms.zip" "$PUBLIC_OUTPUT_DIR/router-forms.zip"
fi
echo "$OUTPUT_DIR/router-forms.zip"
