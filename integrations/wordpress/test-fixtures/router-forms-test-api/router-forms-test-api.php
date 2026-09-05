<?php
/**
 * Plugin Name: Router Forms Test API
 * Description: Supplies deterministic Router API responses inside the wp-env test matrix.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

function router_forms_test_api_response($preempt, $args, $url) {
    if ($url !== 'https://app.router.so/api/integrations/wordpress/forms') {
        return $preempt;
    }

    $headers = isset($args['headers']) && is_array($args['headers']) ? $args['headers'] : array();
    $authorization = isset($headers['Authorization']) ? $headers['Authorization'] : '';
    $authorized = $authorization === 'Bearer secret-test-token';
    $status = $authorized ? 200 : 401;
    $body = $authorized
        ? wp_json_encode(array(
            'forms' => array(array(
                'publicId' => 'browser-form',
                'name' => 'Browser Matrix',
                'title' => 'Browser matrix form',
                'revision' => 1,
            )),
        ))
        : wp_json_encode(array('error' => 'invalid_or_revoked_site_token'));

    return array(
        'headers' => array('content-type' => 'application/json'),
        'body' => $body,
        'response' => array(
            'code' => $status,
            'message' => $authorized ? 'OK' : 'Unauthorized',
        ),
        'cookies' => array(),
        'filename' => null,
    );
}
add_filter('pre_http_request', 'router_forms_test_api_response', 10, 3);
