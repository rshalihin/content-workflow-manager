<?php
/**
 * Plugin settings accessor.
 *
 * @package Sit_Cwm
 * @since   1.0.0
 */

namespace Sit_Cwm\Core;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Typed accessor over the `sit_cwm_settings` option (D7).
 *
 * Reads always return every known key (stored values over defaults); writes
 * merge, validate and sanitize before saving.
 *
 * @since 1.0.0
 */
final class Settings {

	/**
	 * Option name.
	 *
	 * @since 1.0.0
	 * @var string
	 */
	const OPTION = 'sit_cwm_settings';

	/**
	 * Default settings.
	 *
	 * @since 1.0.0
	 *
	 * @return array{post_types: string[], delete_data_on_uninstall: bool}
	 */
	public function defaults(): array {
		return array(
			'post_types'               => array( 'post', 'page' ),
			'delete_data_on_uninstall' => false,
		);
	}

	/**
	 * All settings: stored values merged over defaults, known keys only.
	 *
	 * @since 1.0.0
	 *
	 * @return array{post_types: string[], delete_data_on_uninstall: bool}
	 */
	public function all(): array {
		$defaults = $this->defaults();
		$stored   = get_option( self::OPTION, array() );

		if ( ! is_array( $stored ) ) {
			$stored = array();
		}

		return array_merge( $defaults, array_intersect_key( $stored, $defaults ) );
	}

	/**
	 * A single setting.
	 *
	 * @since 1.0.0
	 *
	 * @param string $key           Setting key.
	 * @param mixed  $default_value Returned when the key is unknown.
	 * @return mixed
	 */
	public function get( string $key, $default_value = null ) {
		$all = $this->all();

		return array_key_exists( $key, $all ) ? $all[ $key ] : $default_value;
	}

	/**
	 * Merges a partial settings array into the stored settings and saves it.
	 *
	 * The whole update is rejected (nothing saved) when the payload is not an
	 * array or `post_types` is not a list of registered public post types.
	 * Unknown keys are ignored.
	 *
	 * @since 1.0.0
	 *
	 * @param mixed $partial Partial settings, e.g. `[ 'post_types' => [ 'post' ] ]`.
	 * @return bool True when the settings are valid and stored.
	 */
	public function update( $partial ): bool {
		if ( ! is_array( $partial ) ) {
			return false;
		}

		$settings = $this->all();

		if ( array_key_exists( 'post_types', $partial ) ) {
			$post_types = $this->sanitize_post_types( $partial['post_types'] );

			if ( null === $post_types ) {
				return false;
			}

			$settings['post_types'] = $post_types;
		}

		if ( array_key_exists( 'delete_data_on_uninstall', $partial ) ) {
			$settings['delete_data_on_uninstall'] = rest_sanitize_boolean( $partial['delete_data_on_uninstall'] );
		}

		if ( get_option( self::OPTION ) === $settings ) {
			return true;
		}

		return update_option( self::OPTION, $settings );
	}

	/**
	 * Seeds the option with defaults when it is absent. Never overwrites.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function seed(): void {
		add_option( self::OPTION, $this->defaults() );
	}

	/**
	 * Post types the workflow applies to.
	 *
	 * @since 1.0.0
	 *
	 * @return string[]
	 */
	public function enabled_post_types(): array {
		$types = (array) $this->get( 'post_types', array() );

		/**
		 * Filters the post types the editorial workflow applies to.
		 *
		 * @since 1.0.0
		 *
		 * @param string[] $types Post type slugs from settings.
		 */
		$types = apply_filters( 'sit_cwm_enabled_post_types', $types );

		return array_values( array_filter( (array) $types, 'is_string' ) );
	}

	/**
	 * Whether the workflow applies to a post type.
	 *
	 * @since 1.0.0
	 *
	 * @param string $post_type Post type slug.
	 * @return bool
	 */
	public function is_post_type_enabled( string $post_type ): bool {
		return in_array( $post_type, $this->enabled_post_types(), true );
	}

	/**
	 * Validates a post type list against registered public post types.
	 *
	 * @since 1.0.0
	 *
	 * @param mixed $value Raw value.
	 * @return string[]|null Unique slugs, or null when invalid.
	 */
	private function sanitize_post_types( $value ): ?array {
		if ( ! is_array( $value ) ) {
			return null;
		}

		$public = get_post_types( array( 'public' => true ) );
		$types  = array();

		foreach ( $value as $post_type ) {
			if ( ! is_string( $post_type ) ) {
				return null;
			}

			$post_type = sanitize_key( $post_type );

			if ( ! isset( $public[ $post_type ] ) ) {
				return null;
			}

			$types[] = $post_type;
		}

		return array_values( array_unique( $types ) );
	}
}
