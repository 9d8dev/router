#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE_CHECK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/router-forms-package.XXXXXX")
trap 'rm -rf "$PACKAGE_CHECK_DIR"' EXIT

find "$SCRIPT_DIR/router-forms" -name '*.php' -exec php -l {} \;
php "$SCRIPT_DIR/render-test.php"
node -e 'const block=require(process.argv[1]); if(block.apiVersion!==3||block.name!=="router/forms") process.exit(1)' "$SCRIPT_DIR/router-forms/block.json"
ROUTER_FORMS_OUTPUT_DIR="$PACKAGE_CHECK_DIR" \
  ROUTER_FORMS_PUBLISH_DOWNLOAD=false \
  "$SCRIPT_DIR/package.sh" >/dev/null
unzip -t "$PACKAGE_CHECK_DIR/router-forms.zip"
unzip -t "$SCRIPT_DIR/../../public/downloads/router-forms.zip"
mkdir -p "$PACKAGE_CHECK_DIR/generated" "$PACKAGE_CHECK_DIR/published"
unzip -q "$PACKAGE_CHECK_DIR/router-forms.zip" -d "$PACKAGE_CHECK_DIR/generated"
unzip -q "$SCRIPT_DIR/../../public/downloads/router-forms.zip" -d "$PACKAGE_CHECK_DIR/published"
diff -qr "$PACKAGE_CHECK_DIR/generated" "$PACKAGE_CHECK_DIR/published"
