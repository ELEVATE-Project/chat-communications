'use strict'
const User = require('@database/models/index').User
const { Op, literal } = require('sequelize')

exports.create = async (data, tenantCode) => {
	try {
		data.tenant_code = tenantCode
		const user = await User.create(data)
		return user.get({ plain: true })
	} catch (error) {
		throw error
	}
}

exports.findOne = async (filter, tenantCode, options = {}) => {
	try {
		filter.tenant_code = tenantCode
		return await User.findOne({
			where: filter,
			...options,
			raw: true,
		})
	} catch (error) {
		throw error
	}
}

exports.update = async (filter, update, tenantCode, options = {}) => {
	try {
		filter.tenant_code = tenantCode
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

exports.findUserWithJsonbFilter = async (filter, tenantCode, options = {}) => {
	try {
		const where = {}
		const jsonbMappings = {
			user_info_external_user_id: "user_info->>'external_user_id'",
			// add more mappings as needed
		}

		const conditions = []

		for (const key in filter) {
			if (jsonbMappings[key]) {
				conditions.push(literal(`${jsonbMappings[key]} = '${filter[key]}'`))
			} else {
				where[key] = filter[key]
			}
		}

		where.tenant_code = tenantCode

		if (conditions.length > 0) {
			where[Op.and] = conditions
		}

		return await User.findOne({
			where,
			...options,
			raw: true,
		})
	} catch (error) {
		throw error
	}
}
