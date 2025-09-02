module.exports = {
	testEnvironment: 'node',
	collectCoverageFrom: ['src/**/*.js', '!src/node_modules/**'],
	testMatch: ['**/test/**/*.js', '**/?(*.)+(spec|test).js'],
	testPathIgnorePatterns: ['/node_modules/'],
	setupFilesAfterEnv: [],
	verbose: true,
}
