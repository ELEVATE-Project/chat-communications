'use strict'
const crypto = require('crypto')

// Retrieve environment variables and parse lengths as integers
const USERNAME_HASH_SALT = process.env.USERNAME_HASH_SALT || ''
const PASSWORD_HASH_SALT = process.env.PASSWORD_HASH_SALT || ''
const USERNAME_HASH_LENGTH = parseInt(process.env.USERNAME_HASH_LENGTH, 10) || 8
const PASSWORD_HASH_LENGTH = parseInt(process.env.PASSWORD_HASH_LENGTH, 10) || 8

exports.usernameHash = (string) => {
	try {
		return crypto
			.createHash('shake256', { outputLength: USERNAME_HASH_LENGTH })
			.update(USERNAME_HASH_SALT + string)
			.digest('hex')
	} catch (error) {
		throw error
	}
}

exports.passwordHash = (string) => {
	try {
		return crypto
			.createHash('shake256', { outputLength: PASSWORD_HASH_LENGTH })
			.update(PASSWORD_HASH_SALT + string)
			.digest('hex')
	} catch (error) {
		throw error
	}
}
