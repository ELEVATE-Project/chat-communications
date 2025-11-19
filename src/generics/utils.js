'use strict'
const crypto = require('crypto')

/**
 * Environment variables for hashing.
 * @constant {string} USERNAME_HASH_SALT - Salt for hashing usernames.
 * @constant {string} PASSWORD_HASH_SALT - Salt for hashing passwords.
 * @constant {number} USERNAME_HASH_LENGTH - Length of the username hash. Defaults to 8.
 * @constant {number} PASSWORD_HASH_LENGTH - Length of the password hash. Defaults to 8.
 */
const USERNAME_HASH_SALT = process.env.USERNAME_HASH_SALT
const PASSWORD_HASH_SALT = process.env.PASSWORD_HASH_SALT
const USERNAME_HASH_LENGTH = parseInt(process.env.USERNAME_HASH_LENGTH, 10) || 8
const PASSWORD_HASH_LENGTH = parseInt(process.env.PASSWORD_HASH_LENGTH, 10) || 8

/**
 * Generates a hashed username using the shake256 algorithm.
 *
 * @param {string} string - The input string (username) to hash.
 * @returns {string} - The hashed username in hexadecimal format.
 * @throws {Error} - Throws an error if hashing fails.
 *
 * @example
 * // Assuming process.env.USERNAME_HASH_SALT = 'username_salt'
 * // Assuming process.env.USERNAME_HASH_LENGTH = '8'
 * const hash = usernameHash('exampleUser');
 * console.log(hash); // Output: A fixed-length hash like "5f4dcc3b"
 */
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

/**
 * Generates a hashed password using the shake256 algorithm.
 *
 * @param {string} string - The input string (password) to hash.
 * @returns {string} - The hashed password in hexadecimal format.
 * @throws {Error} - Throws an error if hashing fails.
 *
 * @example
 * // Assuming process.env.PASSWORD_HASH_SALT = 'password_salt'
 * // Assuming process.env.PASSWORD_HASH_LENGTH = '8'
 * const hash = passwordHash('examplePassword');
 * console.log(hash); // Output: A fixed-length hash like "e99a18c4"
 */
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
