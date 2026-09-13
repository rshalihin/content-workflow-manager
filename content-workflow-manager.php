<?php
/**
 * Plugin Name:       Content Workflow Manager
 * Plugin URI:        https://github.com/shappire-it/content-workflow-manager
 * Description:       Adds an editorial approval workflow (Draft, Writing, Review, Needs Changes, Approved, Published) with reviewers, due dates, comments and activity history to posts, pages and custom post types.
 * Version:           1.0.0
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * Author:            Shappire IT
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       sit-cwm
 * Domain Path:       /languages
 *
 * @package Sit_Cwm
 * @since   1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! defined( 'SIT_CWM_VERSION' ) ) {
	/**
	 * Plugin version. Kept in lockstep with the header and package.json.
	 *
	 * @since 1.0.0
	 */
	define( 'SIT_CWM_VERSION', '1.0.0' );
}

if ( ! defined( 'SIT_CWM_PLUGIN_FILE' ) ) {
	/**
	 * Absolute path to the main plugin file.
	 *
	 * @since 1.0.0
	 */
	define( 'SIT_CWM_PLUGIN_FILE', __FILE__ );
}

if ( ! defined( 'SIT_CWM_PLUGIN_DIR' ) ) {
	/**
	 * Absolute path to the plugin directory, with trailing slash.
	 *
	 * @since 1.0.0
	 */
	define( 'SIT_CWM_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
}

if ( ! defined( 'SIT_CWM_PLUGIN_URL' ) ) {
	/**
	 * URL to the plugin directory, with trailing slash.
	 *
	 * @since 1.0.0
	 */
	define( 'SIT_CWM_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
}

if ( ! defined( 'SIT_CWM_DB_VERSION' ) ) {
	/**
	 * Schema version of the custom tables, compared against the
	 * `sit_cwm_db_version` option to trigger upgrades.
	 *
	 * @since 1.0.0
	 */
	define( 'SIT_CWM_DB_VERSION', '1.0.0' );
}

if ( file_exists( SIT_CWM_PLUGIN_DIR . 'vendor/autoload.php' ) ) {
	require_once SIT_CWM_PLUGIN_DIR . 'vendor/autoload.php';
} else {
	spl_autoload_register( 'sit_cwm_autoload' );
}

/**
 * PSR-4 fallback autoloader for `Sit_Cwm\` classes, used when the plugin runs
 * from a clone or release zip without `composer install`.
 *
 * @since 1.0.0
 *
 * @param string $class_name Fully qualified class name.
 * @return void
 */
function sit_cwm_autoload( $class_name ) {
	$prefix = 'Sit_Cwm\\';

	if ( 0 !== strpos( $class_name, $prefix ) ) {
		return;
	}

	$relative = substr( $class_name, strlen( $prefix ) );
	$file     = SIT_CWM_PLUGIN_DIR . 'includes/' . str_replace( '\\', '/', $relative ) . '.php';

	if ( is_readable( $file ) ) {
		require_once $file;
	}
}
