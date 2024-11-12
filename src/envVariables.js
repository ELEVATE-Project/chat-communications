let table = require('cli-table')

let tableData = new table()

let environmentVariables = {
	APPLICATION_ENV: {
		message: 'Required node environment',
		optional: false,
	},

	APPLICATION_PORT: {
		message: 'Required port number',
		optional: true,
		default: 3123,
	},

	APPLICATION_BASE_URL: {
		message: 'Required application base URL',
		optional: true,
		default: '/communications/',
	},

	API_DOC_URL: {
		message: 'Required API documentation URL',
		optional: true,
		default: '/api-doc',
	},

	CHAT_PLATFORM: {
		message: 'Chat platform name',
		optional: false,
	},

	CHAT_PLATFORM_URL: {
		message: 'Chat platform base URL',
		optional: false,
	},

	CHAT_PLATFORM_ADMIN_EMAIL: {
		message: 'Chat platform admin email',
		optional: false,
	},

	CHAT_PLATFORM_ADMIN_PASSWORD: {
		message: 'Chat platform admin password',
		optional: false,
	},

	CHAT_PLATFORM_ADMIN_USER_ID: {
		message: 'Chat platform admin user ID',
		optional: false,
	},

	INTERNAL_ACCESS_TOKEN: {
		message: 'Internal access token for secure communication',
		optional: false,
	},

	DEV_DATABASE_URL: {
		message: 'Development database URL',
		optional: false,
	},

	USERNAME_HASH_SALT: {
		message: 'Salt for username hashing',
		optional: false,
	},

	PASSWORD_HASH_SALT: {
		message: 'Salt for password hashing',
		optional: false,
	},

	USERNAME_HASH_LENGTH: {
		message: 'Length of the hashed username',
		optional: true,
		default: '8',
	},

	PASSWORD_HASH_LENGTH: {
		message: 'Length of the hashed password',
		optional: true,
		default: '8',
	},
}

let success = true

module.exports = function () {
	Object.keys(environmentVariables).forEach((eachEnvironmentVariable) => {
		let tableObj = {
			[eachEnvironmentVariable]: 'PASSED',
		}

		let keyCheckPass = true

		if (
			environmentVariables[eachEnvironmentVariable].optional === true &&
			environmentVariables[eachEnvironmentVariable].requiredIf &&
			environmentVariables[eachEnvironmentVariable].requiredIf.key &&
			environmentVariables[eachEnvironmentVariable].requiredIf.key != '' &&
			environmentVariables[eachEnvironmentVariable].requiredIf.operator &&
			validRequiredIfOperators.includes(environmentVariables[eachEnvironmentVariable].requiredIf.operator) &&
			environmentVariables[eachEnvironmentVariable].requiredIf.value &&
			environmentVariables[eachEnvironmentVariable].requiredIf.value != ''
		) {
			switch (environmentVariables[eachEnvironmentVariable].requiredIf.operator) {
				case 'EQUALS':
					if (
						process.env[environmentVariables[eachEnvironmentVariable].requiredIf.key] ===
						environmentVariables[eachEnvironmentVariable].requiredIf.value
					) {
						environmentVariables[eachEnvironmentVariable].optional = false
					}
					break
				case 'NOT_EQUALS':
					if (
						process.env[environmentVariables[eachEnvironmentVariable].requiredIf.key] !=
						environmentVariables[eachEnvironmentVariable].requiredIf.value
					) {
						environmentVariables[eachEnvironmentVariable].optional = false
					}
					break
				default:
					break
			}
		}

		if (environmentVariables[eachEnvironmentVariable].optional === false) {
			if (!process.env[eachEnvironmentVariable] || process.env[eachEnvironmentVariable] == '') {
				success = false
				keyCheckPass = false
			} else if (
				environmentVariables[eachEnvironmentVariable].possibleValues &&
				Array.isArray(environmentVariables[eachEnvironmentVariable].possibleValues) &&
				environmentVariables[eachEnvironmentVariable].possibleValues.length > 0
			) {
				if (
					!environmentVariables[eachEnvironmentVariable].possibleValues.includes(
						process.env[eachEnvironmentVariable]
					)
				) {
					success = false
					keyCheckPass = false
					environmentVariables[eachEnvironmentVariable].message += ` Valid values - ${environmentVariables[
						eachEnvironmentVariable
					].possibleValues.join(', ')}`
				}
			}
		}

		if (
			(!process.env[eachEnvironmentVariable] || process.env[eachEnvironmentVariable] == '') &&
			environmentVariables[eachEnvironmentVariable].default &&
			environmentVariables[eachEnvironmentVariable].default != ''
		) {
			process.env[eachEnvironmentVariable] = environmentVariables[eachEnvironmentVariable].default
		}

		if (!keyCheckPass) {
			if (environmentVariables[eachEnvironmentVariable].message !== '') {
				tableObj[eachEnvironmentVariable] = environmentVariables[eachEnvironmentVariable].message
			} else {
				tableObj[eachEnvironmentVariable] = `FAILED - ${eachEnvironmentVariable} is required`
			}
		}

		tableData.push(tableObj)
	})

	console.log(tableData.toString())

	return {
		success: success,
	}
}
