<?php
/**
 * Uninstall routine for Content Workflow Manager.
 *
 * Removes plugin data only when the site owner opted in via
 * `sit_cwm_settings['delete_data_on_uninstall']`. Deactivation never removes
 * data; this file runs only when the plugin is deleted.
 *
 * @package Sit_Cwm
 * @since   1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

/**
 * Removes all Content Workflow Manager data from the current site, if the
 * site opted in to data deletion.
 *
 * @since 1.0.0
 *
 * @return void
 */
function sit_cwm_uninstall_site() {
	global $wpdb;

	$settings = get_option( 'sit_cwm_settings', array() );

	if ( ! is_array( $settings ) || empty( $settings['delete_data_on_uninstall'] ) ) {
		return;
	}

	// Activity table (D8). Identifier placeholder %i requires WP 6.2+.
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Dropping the plugin's own table on uninstall.
	$wpdb->query( $wpdb->prepare( 'DROP TABLE IF EXISTS %i', $wpdb->prefix . 'sit_cwm_activity' ) );

	// All `_sit_cwm_*` post meta (D6).
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Bulk meta removal on uninstall; no API equivalent for a key prefix.
	$wpdb->query(
		$wpdb->prepare(
			"DELETE FROM {$wpdb->postmeta} WHERE meta_key LIKE %s",
			$wpdb->esc_like( '_sit_cwm_' ) . '%'
		)
	);

	// Custom capabilities (D5).
	$capabilities = array(
		'sit_cwm_manage_workflows',
		'sit_cwm_change_workflow',
		'sit_cwm_assign_reviewer',
		'sit_cwm_review_content',
		'sit_cwm_approve_content',
		'sit_cwm_view_activity',
	);

	foreach ( array_keys( wp_roles()->roles ) as $role_name ) {
		$role = get_role( $role_name );

		if ( null === $role ) {
			continue;
		}

		foreach ( $capabilities as $capability ) {
			$role->remove_cap( $capability );
		}
	}

	delete_option( 'sit_cwm_db_version' );
	delete_option( 'sit_cwm_settings' );

	wp_cache_flush();
}

if ( is_multisite() ) {
	$sit_cwm_site_ids = get_sites(
		array(
			'fields' => 'ids',
			'number' => 0,
		)
	);

	foreach ( $sit_cwm_site_ids as $sit_cwm_site_id ) {
		switch_to_blog( $sit_cwm_site_id );
		sit_cwm_uninstall_site();
		restore_current_blog();
	}
} else {
	sit_cwm_uninstall_site();
}
