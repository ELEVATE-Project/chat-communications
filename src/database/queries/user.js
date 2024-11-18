'use strict'
const User = require('@database/models/index').User

exports.create = async (data) => {
	try {
		const user = await User.create(data)
		return user.get({ plain: true })
	} catch (error) {
		throw error
	}
}

exports.findOne = async (filter, options = {}) => {
	try {
		return await User.findOne({
			where: filter,
			...options,
			raw: true,
		})
	} catch (error) {
		throw error
	}
}

exports.update = async (filter, update, options = {}) => {
	try {
		const [res] = await User.update(update, {
			where: filter,
			...options,
			individualHooks: true,
		})

		return res
	} catch (error) {
		throw error
	}
}
