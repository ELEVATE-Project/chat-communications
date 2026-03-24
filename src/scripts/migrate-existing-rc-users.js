'use strict'
require('dotenv').config({ path: '../.env' })

const axios = require('axios')
const crypto = require('crypto')
const { Sequelize, QueryTypes } = require('sequelize')

// RC admin client
const rcClient = axios.create({
	baseURL: `${process.env.CHAT_PLATFORM_URL}/api/v1`,
	headers: {
		'X-Auth-Token': process.env.CHAT_PLATFORM_ACCESS_TOKEN,
		'X-User-Id': process.env.CHAT_PLATFORM_ADMIN_USER_ID,
		'Content-Type': 'application/json',
	},
})

// DB connection
const sequelize = new Sequelize(process.env.DEV_DATABASE_URL, {
	dialect: 'postgres',
	logging: false,
})

const SYNTHETIC_DOMAIN = process.env.CHAT_USER_EMAIL_DOMAIN || 'yopmail.com'
const USERNAME_HASH_SALT = process.env.USERNAME_HASH_SALT
const USERNAME_HASH_LENGTH = parseInt(process.env.USERNAME_HASH_LENGTH || '10')

function usernameHash(userId) {
	return crypto
		.createHash('shake256', { outputLength: USERNAME_HASH_LENGTH })
		.update(USERNAME_HASH_SALT + userId)
		.digest('hex')
}

async function getRCUserEmail(rcUserId) {
	const { data } = await rcClient.get('/users.info', { params: { userId: rcUserId } })
	return data.user?.emails?.[0]?.address || null
}

async function updateRCEmail(rcUserId, newEmail) {
	await rcClient.post('/users.update', {
		userId: rcUserId,
		data: { email: newEmail },
	})
}

async function run() {
	console.log('=== Migrate existing RC users to synthetic email ===')
	console.log(`Synthetic email domain: ${SYNTHETIC_DOMAIN}`)
	console.log()

	if (!USERNAME_HASH_SALT) {
		console.error('ERROR: USERNAME_HASH_SALT is not set in .env')
		process.exit(1)
	}

	await sequelize.authenticate()

	// Fetch all active (non-deleted) users from chat-communications DB
	const activeUsers = await sequelize.query(
		`SELECT user_id, user_info, tenant_code FROM users WHERE deleted_at IS NULL`,
		{ type: QueryTypes.SELECT }
	)

	console.log(`Found ${activeUsers.length} active users in DB`)
	console.log()

	let migrated = 0
	let skipped = 0
	let failed = 0

	for (const row of activeUsers) {
		const rcUserId = row.user_info?.external_user_id
		if (!rcUserId) {
			console.log(`  SKIP  user_id=${row.user_id} — no external_user_id`)
			skipped++
			continue
		}

		try {
			const currentEmail = await getRCUserEmail(rcUserId)

			if (!currentEmail) {
				console.log(`  SKIP  user_id=${row.user_id} rc_id=${rcUserId} — RC user not found`)
				skipped++
				continue
			}

			const expectedEmail = `${usernameHash(row.user_id)}@${SYNTHETIC_DOMAIN}`

			if (currentEmail === expectedEmail || currentEmail.endsWith(`@${SYNTHETIC_DOMAIN}`)) {
				console.log(`  SKIP  user_id=${row.user_id} rc_id=${rcUserId} — already synthetic`)
				skipped++
				continue
			}

			await updateRCEmail(rcUserId, expectedEmail)
			console.log(`  MIGRATED user_id=${row.user_id} rc_id=${rcUserId}`)
			console.log(`           ${currentEmail} → ${expectedEmail}`)
			migrated++
		} catch (err) {
			console.log(
				`  FAIL  user_id=${row.user_id} rc_id=${rcUserId} — ${err.response?.data?.error || err.message}`
			)
			failed++
		}
	}

	console.log()
	console.log(`=== Done: migrated=${migrated} skipped=${skipped} failed=${failed} ===`)

	await sequelize.close()
}

run().catch((err) => {
	console.error('Fatal error:', err.message)
	process.exit(1)
})
