#!/usr/bin/env sh
set -eu

wp_env_config=$1
theme_slug=$2

pnpm exec wp-env run cli --config="$wp_env_config" -- wp theme install "$theme_slug" --activate --force
pnpm exec wp-env run cli --config="$wp_env_config" -- wp plugin activate router-forms
pnpm exec wp-env run cli --config="$wp_env_config" -- wp plugin activate router-forms-test-api
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
pnpm exec wp-env run cli --config="$wp_env_config" -- wp option update permalink_structure '/%postname%/'
pnpm exec wp-env run cli --config="$wp_env_config" -- wp rewrite flush --hard
pnpm exec wp-env run cli --config="$wp_env_config" -- wp eval '
$pages = array(
    "router-forms-shortcode" => array("Router Forms Shortcode", "[router_form id=\"browser-form\"]"),
    "router-forms-block" => array("Router Forms Block", "<!-- wp:router/forms {\"formId\":\"browser-form\"} /-->"),
    "router-forms-multiple" => array("Router Forms Multiple", "[router_form id=\"browser-form\"]<!-- wp:router/forms {\"formId\":\"browser-form\"} /-->"),
);
foreach ($pages as $slug => $page) {
    $existing = get_page_by_path($slug, OBJECT, "page");
    $result = wp_insert_post(array(
        "ID" => $existing ? $existing->ID : 0,
        "post_type" => "page",
        "post_status" => "publish",
        "post_title" => $page[0],
        "post_name" => $slug,
        "post_content" => $page[1],
    ), true);
    if (is_wp_error($result)) {
        fwrite(STDERR, $result->get_error_message() . "\n");
        exit(1);
    }
}
'
WORDPRESS_BASE_URL="http://localhost:8888" pnpm exec playwright test e2e/wordpress-runtime.spec.ts --project=chromium --workers=1
