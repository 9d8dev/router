#!/usr/bin/env sh
set -eu

wp_env_config=$1
theme_slug=$2

pnpm exec wp-env run cli --config="$wp_env_config" -- wp theme install "$theme_slug" --activate --force
pnpm exec wp-env run cli --config="$wp_env_config" -- wp plugin activate router-forms
pnpm exec wp-env run cli --config="$wp_env_config" -- wp eval '
$registry = WP_Block_Type_Registry::get_instance();
if (!$registry->is_registered("router/forms")) {
    fwrite(STDERR, "Router Forms block was not registered.\n");
    exit(1);
}
$shortcode = do_shortcode("[router_form id=browser-form]");
$block = render_block(array(
    "blockName" => "router/forms",
    "attrs" => array("formId" => "browser-form"),
    "innerBlocks" => array(),
    "innerHTML" => "",
    "innerContent" => array(),
));
$combined = $shortcode . $block;
if (substr_count($combined, "data-router-form=\"browser-form\"") !== 2) {
    fwrite(STDERR, "Block and shortcode did not produce matching mount points.\n");
    exit(1);
}
update_option("router_forms_site_token", "secret-test-token");
if (strpos($combined, "secret-test-token") !== false) {
    fwrite(STDERR, "The site token leaked into frontend markup.\n");
    exit(1);
}
echo "Router Forms WordPress smoke passed.\n";
'
