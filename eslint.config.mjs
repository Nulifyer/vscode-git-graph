import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default [
	{ ignores: ['node_modules/**', 'out/**', 'media/**', 'coverage/**', '.build/**'] },
	{
		files: ['src/**/*.ts', 'tests/**/*.ts', 'web/**/*.ts', 'scripts/**/*.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: { project: ['./src/tsconfig.json', './tests/tsconfig.json', './web/tsconfig.json', './scripts/tsconfig.json'], tsconfigRootDir: import.meta.dirname }
		},
		plugins: { '@typescript-eslint': tseslint.plugin, '@stylistic': stylistic },
		rules: {
			"@stylistic/arrow-spacing": [
						"warn",
						{
									"before": true,
									"after": true
						}
			],
			"@stylistic/brace-style": [
						"warn",
						"1tbs",
						{
									"allowSingleLine": true
						}
			],
			"@stylistic/comma-dangle": "warn",
			"@stylistic/comma-spacing": "warn",
			"@stylistic/comma-style": "warn",
			"@stylistic/dot-location": [
						"warn",
						"property"
			],
			"@stylistic/eol-last": "warn",
			"eqeqeq": "warn",
			"@stylistic/function-call-spacing": "warn",
			"@stylistic/indent": [
						"warn",
						"tab",
						{
									"SwitchCase": 1
						}
			],
			"@stylistic/key-spacing": "warn",
			"new-cap": "warn",
			"@stylistic/new-parens": "warn",
			"no-alert": "error",
			"no-console": "error",
			"no-eval": "error",
			"no-extra-boolean-cast": "warn",
			"no-implied-eval": "error",
			"no-irregular-whitespace": "warn",
			"no-labels": "error",
			"@stylistic/no-multi-spaces": "warn",
			"no-proto": "error",
			"no-prototype-builtins": "error",
			"no-redeclare": "off",
			"no-global-assign": "error",
			"no-shadow-restricted-names": "error",
			"no-script-url": "error",
			"no-sparse-arrays": "warn",
			"@stylistic/no-trailing-spaces": "warn",
			"no-unneeded-ternary": "warn",
			"no-unsafe-negation": "warn",
			"no-unused-expressions": "off",
			"no-var": "warn",
			"@stylistic/no-whitespace-before-property": "warn",
			"no-with": "error",
			"@stylistic/padded-blocks": [
						"warn",
						{
									"classes": "never",
									"switches": "never"
						}
			],
			"@stylistic/quotes": [
						"warn",
						"single"
			],
			"@stylistic/rest-spread-spacing": "warn",
			"@stylistic/semi": "warn",
			"sort-imports": [
						"warn",
						{
									"allowSeparatedGroups": true,
									"ignoreDeclarationSort": true
						}
			],
			"@stylistic/space-before-function-paren": [
						"warn",
						{
									"anonymous": "always",
									"named": "never",
									"asyncArrow": "always"
						}
			],
			"@stylistic/space-before-blocks": "warn",
			"@stylistic/space-infix-ops": "warn",
			"@stylistic/spaced-comment": "warn",
			"@stylistic/template-curly-spacing": "warn",
			"@stylistic/wrap-iife": [
						"warn",
						"inside"
			],
			"yoda": "warn",
			"@typescript-eslint/await-thenable": "warn",
			"@typescript-eslint/ban-ts-comment": "error",
			"@typescript-eslint/class-literal-property-style": [
						"warn",
						"fields"
			],
			"@typescript-eslint/explicit-member-accessibility": [
						"warn",
						{
									"overrides": {
												"accessors": "off",
												"constructors": "off"
									}
						}
			],
			"@typescript-eslint/method-signature-style": [
						"warn",
						"property"
			],
			"@typescript-eslint/naming-convention": [
						"warn",
						{
									"selector": "class",
									"format": [
												"StrictPascalCase"
									]
						},
						{
									"selector": "function",
									"format": [
												"camelCase"
									]
						}
			],
			"@typescript-eslint/no-misused-new": "warn",
			"@typescript-eslint/no-this-alias": "warn",
			"@typescript-eslint/no-redeclare": "warn",
			"@typescript-eslint/no-unused-expressions": "warn"
}
	},
	{ files: ['src/askpass/*.ts', 'scripts/*.ts'], rules: { 'no-console': 'off', '@stylistic/spaced-comment': 'off' } },
	{ files: ['tests/mocks/*.ts'], rules: { 'no-global-assign': 'off' } }
];
