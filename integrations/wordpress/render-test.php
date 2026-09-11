<?php

define('ABSPATH', __DIR__);

function get_block_wrapper_attributes() {
    return 'class="wp-block-router-forms alignwide" style="padding-top:12px"';
}

function router_forms_mount_markup($public_id) {
    return '<div data-router-form="' . htmlspecialchars($public_id, ENT_QUOTES, 'UTF-8') . '"></div>';
}

$attributes = array('formId' => 'browser-form');

ob_start();
require __DIR__ . '/router-forms/render.php';
$html = ob_get_clean();

if (strpos($html, 'class="wp-block-router-forms alignwide"') === false) {
    fwrite(STDERR, "Dynamic block markup omitted the WordPress block wrapper attributes.\n");
    exit(1);
}

if (strpos($html, 'style="padding-top:12px"') === false) {
    fwrite(STDERR, "Dynamic block markup omitted WordPress-generated block styles.\n");
    exit(1);
}

if (substr_count($html, 'data-router-form="browser-form"') !== 1) {
    fwrite(STDERR, "Dynamic block markup did not contain exactly one Router form mount point.\n");
    exit(1);
}
