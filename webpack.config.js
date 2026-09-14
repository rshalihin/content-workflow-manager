/**
 * Webpack config: the @wordpress/scripts default with the plugin's two entry
 * points and output in assets/build/. The default
 * DependencyExtractionWebpackPlugin stays in place and emits *.asset.php.
 */
const path = require( 'path' );
const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );

module.exports = {
	...defaultConfig,
	entry: {
		sidebar: path.resolve( __dirname, 'src/sidebar/index.js' ),
		dashboard: path.resolve( __dirname, 'src/dashboard/index.js' ),
	},
	output: {
		...defaultConfig.output,
		path: path.resolve( __dirname, 'assets/build' ),
	},
};
