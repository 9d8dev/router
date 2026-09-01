<?php
/**
 * Plugin Name: Router Forms
 * Description: Render published Router forms with a Gutenberg block or shortcode.
 * Version: 1.0.0
 * Requires at least: 6.6
 * Requires PHP: 7.4
 * Author: Router
 * License: GPL-2.0-or-later
 * Text Domain: router-forms
 */

if (!defined('ABSPATH')) {
    exit;
}

define('ROUTER_FORMS_VERSION', '1.0.0');
define('ROUTER_FORMS_OPTION', 'router_forms_site_token');

function router_forms_runtime_url() {
    return apply_filters('router_forms_runtime_url', 'https://forms.router.so/embed/v1.js');
}

function router_forms_api_url() {
    return apply_filters('router_forms_api_url', 'https://app.router.so/api/integrations/wordpress/forms');
}

function router_forms_requirements_met() {
    global $wp_version;
    return version_compare(PHP_VERSION, '7.4', '>=') && version_compare($wp_version, '6.6', '>=');
}

function router_forms_admin_requirement_notice() {
    if (router_forms_requirements_met()) {
        return;
    }
    echo '<div class="notice notice-error"><p>' . esc_html__('Router Forms requires WordPress 6.6+ and PHP 7.4+.', 'router-forms') . '</p></div>';
}
add_action('admin_notices', 'router_forms_admin_requirement_notice');

function router_forms_register_runtime() {
    wp_register_script(
        'router-forms-runtime',
        router_forms_runtime_url(),
        array(),
        ROUTER_FORMS_VERSION,
        array('strategy' => 'async', 'in_footer' => true)
    );
}
add_action('wp_enqueue_scripts', 'router_forms_register_runtime');
add_action('enqueue_block_editor_assets', 'router_forms_register_runtime');

function router_forms_mount_markup($public_id) {
    $public_id = sanitize_key($public_id);
    if (!$public_id) {
        return '';
    }
    wp_enqueue_script('router-forms-runtime');
    return sprintf(
        '<div data-router-form="%s" data-router-placement="wordpress"></div>',
        esc_attr($public_id)
    );
}

function router_forms_shortcode($attributes) {
    $attributes = shortcode_atts(array('id' => ''), $attributes, 'router_form');
    return router_forms_mount_markup($attributes['id']);
}
add_shortcode('router_form', 'router_forms_shortcode');

function router_forms_register_block() {
    if (!router_forms_requirements_met()) {
        return;
    }
    register_block_type(__DIR__);
}
add_action('init', 'router_forms_register_block');

function router_forms_register_settings() {
    register_setting(
        'router_forms',
        ROUTER_FORMS_OPTION,
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );
}
add_action('admin_init', 'router_forms_register_settings');

function router_forms_add_settings_page() {
    add_options_page(
        __('Router Forms', 'router-forms'),
        __('Router Forms', 'router-forms'),
        'manage_options',
        'router-forms',
        'router_forms_settings_page'
    );
}
add_action('admin_menu', 'router_forms_add_settings_page');

function router_forms_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    ?>
    <div class="wrap">
        <h1><?php echo esc_html__('Router Forms', 'router-forms'); ?></h1>
        <p><?php echo esc_html__('Paste the read-only site token generated in Router. It is stored in WordPress options and never added to blocks or frontend HTML.', 'router-forms'); ?></p>
        <form action="options.php" method="post">
            <?php settings_fields('router_forms'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="router-forms-token"><?php echo esc_html__('Site token', 'router-forms'); ?></label></th>
                    <td><input id="router-forms-token" name="<?php echo esc_attr(ROUTER_FORMS_OPTION); ?>" type="password" class="regular-text" value="<?php echo esc_attr(get_option(ROUTER_FORMS_OPTION, '')); ?>" autocomplete="off" /></td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}

function router_forms_rest_permission() {
    return current_user_can('edit_posts');
}

function router_forms_proxy_form_list() {
    $token = get_option(ROUTER_FORMS_OPTION, '');
    if (!$token) {
        return new WP_Error('router_forms_not_connected', __('Connect Router Forms in Settings first.', 'router-forms'), array('status' => 401));
    }
    $response = wp_remote_get(
        router_forms_api_url(),
        array(
            'timeout' => 10,
            'headers' => array('Authorization' => 'Bearer ' . $token),
        )
    );
    if (is_wp_error($response)) {
        return new WP_Error('router_forms_unavailable', __('Router is unavailable. Try again shortly.', 'router-forms'), array('status' => 502));
    }
    $status = wp_remote_retrieve_response_code($response);
    $body = json_decode(wp_remote_retrieve_body($response), true);
    if ($status !== 200 || !is_array($body)) {
        return new WP_Error('router_forms_connection_failed', __('The Router site token is invalid or revoked.', 'router-forms'), array('status' => 401));
    }
    return rest_ensure_response($body);
}

function router_forms_register_rest_route() {
    register_rest_route(
        'router-forms/v1',
        '/forms',
        array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'router_forms_proxy_form_list',
            'permission_callback' => 'router_forms_rest_permission',
        )
    );
}
add_action('rest_api_init', 'router_forms_register_rest_route');
