/** Jest — testes unitários (sem DOM) das regras de negócio em src/finance.js. */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: ['src/finance.js'],
  coverageDirectory: 'coverage',
  verbose: true
};
