#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

find "$SCRIPT_DIR/router-forms" -name '*.php' -exec php -l {} \;
php "$SCRIPT_DIR/render-test.php"
node -e 'const block=require(process.argv[1]); if(block.apiVersion!==3||block.name!=="router/forms") process.exit(1)' "$SCRIPT_DIR/router-forms/block.json"
"$SCRIPT_DIR/package.sh" >/dev/null
unzip -t "$SCRIPT_DIR/dist/router-forms.zip"
unzip -t "$SCRIPT_DIR/../../public/downloads/router-forms.zip"
cmp "$SCRIPT_DIR/dist/router-forms.zip" "$SCRIPT_DIR/../../public/downloads/router-forms.zip"
