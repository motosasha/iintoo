/* global module */

let config = {
	'notGetBlocks': [],
	'ignoredBlocks': [
		'no-js',
	],
	'alwaysAddBlocks': [],
	'addStyleBefore': [
		'normalize.css/normalize.css',
		'dev/scss/variables.scss',
		'dev/scss/reboot.scss',
		'dev/scss/mixins.scss',
		'dev/scss/typography.scss',
		'dev/scss/fonts.scss',
		// 'somePackage/dist/somePackage.css', // для 'node_modules/somePackage/dist/somePackage.css',
	],
	'addStyleAfter': [],
	'source': {
		'dev':          'dev/',
		'blocks':       'dev/blocks/',
		'build':        'build/'
	},
};

module.exports = config;
