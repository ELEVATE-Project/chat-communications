const { check, body } = require('express-validator')

module.exports = {
	signup: [
		check('user_id')
			.notEmpty()
			.withMessage('User ID is required.')
			.isString()
			.withMessage('User ID must be a string.'),
		check('name').notEmpty().withMessage('Name is required.').isString().withMessage('Name must be a string.'),
		check('email').notEmpty().withMessage('Email is required.').isEmail().withMessage('Invalid email format.'),
		check('image_url').optional().isURL().withMessage('Image URL must be a valid URL.'),
	],
	login: [
		check('user_id')
			.notEmpty()
			.withMessage('User ID is required.')
			.isString()
			.withMessage('User ID must be a string.'),
	],
	logout: [
		check('user_id')
			.notEmpty()
			.withMessage('User ID is required.')
			.isString()
			.withMessage('User ID must be a string.'),
		check('token').optional().isString().withMessage('Token must be a string if provided.'),
	],
	createRoom: [
		body('usernames')
			.isArray({ min: 2, max: 2 })
			.withMessage('Usernames must be an array of two usernames.')
			.custom((usernames) => usernames.every((username) => typeof username === 'string'))
			.withMessage('Each username must be a string.'),
		check('initial_message')
			.notEmpty()
			.withMessage('Initial message is required.')
			.isString()
			.withMessage('Initial message must be a string.'),
	],
	updateAvatar: [
		check('user_id')
			.notEmpty()
			.withMessage('User ID is required.')
			.isString()
			.withMessage('User ID must be a string.'),
		check('image_url')
			.notEmpty()
			.withMessage('Image URL is required.')
			.isURL()
			.withMessage('Image URL must be a valid URL.'),
	],
	updateUser: [
		check('user_id')
			.notEmpty()
			.withMessage('User ID is required.')
			.isString()
			.withMessage('User ID must be a string.'),
		check('name').notEmpty().withMessage('Name is required.').isString().withMessage('Name must be a string.'),
	],
}
