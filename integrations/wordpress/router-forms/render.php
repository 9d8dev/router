<?php
if (!defined('ABSPATH')) {
    exit;
}

$form_id = isset($attributes['formId']) ? $attributes['formId'] : '';
echo router_forms_mount_markup($form_id); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped by router_forms_mount_markup.
