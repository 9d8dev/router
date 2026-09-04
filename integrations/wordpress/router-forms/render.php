<?php
if (!defined('ABSPATH')) {
    exit;
}

$form_id = isset($attributes['formId']) ? $attributes['formId'] : '';
$mount_markup = router_forms_mount_markup($form_id);

if ($mount_markup === '') {
    return;
}

echo '<div ' . get_block_wrapper_attributes() . '>' . $mount_markup . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- WordPress generates the wrapper attributes and router_forms_mount_markup escapes the public ID.
