module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    // PropTypes necesita otra librería (prop-types) y no usamos librerías extra; con la regla activa el lint marca error en cada prop
    'react/prop-types': 'off',
    // Solo afecta la recarga en caliente de Vite. Se apaga porque ProgresoContext.jsx
    // exporta a la vez el Provider y el hook useProgreso, y eso es intencional
    'react-refresh/only-export-components': 'off',
  },
}
