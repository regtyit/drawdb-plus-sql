module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
    "prettier",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  settings: { react: { version: "18.2" } },
  plugins: ["react-refresh"],
  overrides: [
    {
      // Where the fork does most of its work: catch "used before defined"
      // render-order bugs like the SchemaSync ddl crash at lint time.
      files: [
        "src/components/EditorHeader/Modal/**",
        "src/components/EditorSidePanel/PostgresTab/**",
        "src/hooks/**",
        "src/utils/postgres/**",
      ],
      rules: {
        "no-use-before-define": [
          "error",
          { variables: true, functions: false, classes: false },
        ],
      },
    },
  ],
  rules: {
    "react/prop-types": 0,
    // Kept off at the top level (original fork state); the override above
    // enables no-use-before-define only for the fork's postgres/modal code.
    "react-refresh/only-export-components": "off",
  },
};
