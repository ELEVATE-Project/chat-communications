const { Sequelize } = require('sequelize')
const fs = require('fs')
const path = require('path')
const csv = require('csv-parser')
require('dotenv').config()
const DatabaseConnectionManager = require('./db-connection-utils')

/**
 * Data Migration Helper for Chat Communications Service
 * Handles CSV-based tenant_code backfilling for users table
 */

class ChatDataMigrator {
	constructor() {
		// Initialize database connection manager
		this.dbManager = new DatabaseConnectionManager({
			poolMax: 10,
			poolMin: 2,
			logging: false,
		})
		this.sequelize = this.dbManager.getSequelize()

		// Batch processing configuration
		this.BATCH_SIZE = 1000

		// Data cache for CSV lookup
		this.userTenantLookupCache = new Map()

		// Processing statistics
		this.stats = {
			totalUsersProcessed: 0,
			successfulUpdates: 0,
			failedUpdates: 0,
			startTime: Date.now(),
			missingTenantCodeRecords: [],
			validationErrors: [],
		}

		// Default values for fallback
		this.defaultTenantCode = process.env.DEFAULT_TENANT_CODE || 'default'
	}

	/**
	 * Load CSV data into cache for quick lookup
	 * Expected CSV format: user_id,tenant_code
	 */
	async loadCSVData(csvFilePath) {
		return new Promise((resolve, reject) => {
			console.log('📊 Loading CSV data for user-tenant mapping...')
			let recordCount = 0

			if (!fs.existsSync(csvFilePath)) {
				reject(new Error(`CSV file not found: ${csvFilePath}`))
				return
			}

			fs.createReadStream(csvFilePath)
				.pipe(csv())
				.on('data', (row) => {
					const userId = row.user_id?.trim()
					const tenantCode = row.tenant_code?.trim()

					if (!userId || !tenantCode) {
						console.warn(`⚠️  Skipping invalid row: user_id="${userId}", tenant_code="${tenantCode}"`)
						return
					}

					this.userTenantLookupCache.set(userId, tenantCode)
					recordCount++
				})
				.on('end', () => {
					console.log(`✅ Loaded ${recordCount} user-tenant mappings from CSV`)
					resolve(recordCount)
				})
				.on('error', (error) => {
					console.error('❌ Error reading CSV file:', error)
					reject(error)
				})
		})
	}

	/**
	 * Get tenant_code for a given user_id from cache
	 */
	getTenantCodeForUser(userId) {
		return this.userTenantLookupCache.get(userId) || null
	}

	/**
	 * Validate CSV data coverage against database users
	 */
	async validateCSVCoverage() {
		console.log('🔍 Validating CSV coverage against database users...')

		try {
			// Get all users from database
			const dbUsers = await this.sequelize.query('SELECT user_id FROM users WHERE deleted_at IS NULL', {
				type: Sequelize.QueryTypes.SELECT,
			})

			const dbUserIds = dbUsers.map((u) => u.user_id)
			const csvUserIds = Array.from(this.userTenantLookupCache.keys())

			// Find users in DB but not in CSV
			const missingInCSV = dbUserIds.filter((userId) => !this.userTenantLookupCache.has(userId))

			// Find users in CSV but not in DB
			const extraInCSV = csvUserIds.filter((userId) => !dbUserIds.includes(userId))

			console.log(`📊 Database users: ${dbUserIds.length}`)
			console.log(`📊 CSV mappings: ${csvUserIds.length}`)
			console.log(`📊 Users missing from CSV: ${missingInCSV.length}`)
			console.log(`📊 Extra users in CSV: ${extraInCSV.length}`)

			if (missingInCSV.length > 0) {
				console.log('⚠️  Users in database but missing from CSV:')
				missingInCSV.slice(0, 10).forEach((userId) => console.log(`   - ${userId}`))
				if (missingInCSV.length > 10) {
					console.log(`   ... and ${missingInCSV.length - 10} more`)
				}
			}

			return {
				dbUserCount: dbUserIds.length,
				csvMappingCount: csvUserIds.length,
				missingInCSV: missingInCSV,
				extraInCSV: extraInCSV,
				coveragePercent: (((dbUserIds.length - missingInCSV.length) / dbUserIds.length) * 100).toFixed(2),
			}
		} catch (error) {
			console.error('❌ Error validating CSV coverage:', error)
			throw error
		}
	}

	/**
	 * Process users table with tenant_code backfilling
	 */
	async processUsersTable() {
		console.log('🚀 Starting users table processing...')

		try {
			// Get all users that need tenant_code updates
			const users = await this.sequelize.query(
				`SELECT user_id 
				 FROM users 
				 WHERE tenant_code IS NULL 
				 AND deleted_at IS NULL
				 ORDER BY user_id`,
				{ type: Sequelize.QueryTypes.SELECT }
			)

			console.log(`📊 Found ${users.length} users needing tenant_code updates`)

			if (users.length === 0) {
				console.log('✅ No users need tenant_code updates')
				return { processed: 0, updated: 0, failed: 0 }
			}

			// Process users in batches
			const totalBatches = Math.ceil(users.length / this.BATCH_SIZE)
			let processedCount = 0
			let updatedCount = 0
			let failedCount = 0

			for (let i = 0; i < totalBatches; i++) {
				const startIdx = i * this.BATCH_SIZE
				const endIdx = Math.min(startIdx + this.BATCH_SIZE, users.length)
				const batch = users.slice(startIdx, endIdx)

				console.log(`📦 Processing batch ${i + 1}/${totalBatches} (${batch.length} users)`)

				const batchResult = await this.processBatch(batch)
				processedCount += batchResult.processed
				updatedCount += batchResult.updated
				failedCount += batchResult.failed

				// Progress update
				const progress = (((i + 1) / totalBatches) * 100).toFixed(1)
				console.log(`📈 Progress: ${progress}% - Updated: ${updatedCount}, Failed: ${failedCount}`)
			}

			console.log(`✅ Users table processing completed`)
			console.log(`   Processed: ${processedCount}`)
			console.log(`   Updated: ${updatedCount}`)
			console.log(`   Failed: ${failedCount}`)

			return { processed: processedCount, updated: updatedCount, failed: failedCount }
		} catch (error) {
			console.error('❌ Error processing users table:', error)
			throw error
		}
	}

	/**
	 * Process a batch of users
	 */
	async processBatch(userBatch) {
		const transaction = await this.sequelize.transaction()
		let processed = 0
		let updated = 0
		let failed = 0

		try {
			for (const user of userBatch) {
				const userId = user.user_id
				const tenantCode = this.getTenantCodeForUser(userId)

				if (!tenantCode) {
					console.warn(`⚠️  No tenant_code found for user: ${userId}`)
					this.stats.missingTenantCodeRecords.push(userId)
					failed++
					continue
				}

				// Update user with tenant_code
				await this.sequelize.query(
					'UPDATE users SET tenant_code = :tenantCode, updated_at = NOW() WHERE user_id = :userId',
					{
						replacements: { tenantCode, userId },
						transaction,
					}
				)

				updated++
				processed++
			}

			await transaction.commit()
			return { processed, updated, failed }
		} catch (error) {
			await transaction.rollback()
			console.error('❌ Batch processing failed:', error)
			throw error
		}
	}

	/**
	 * Validate migration results
	 */
	async validateMigration() {
		console.log('🔍 Validating migration results...')

		try {
			// Count users with and without tenant_code
			const results = await this.sequelize.query(
				`SELECT 
					COUNT(*) as total_users,
					COUNT(tenant_code) as users_with_tenant_code,
					COUNT(*) - COUNT(tenant_code) as users_without_tenant_code
				 FROM users 
				 WHERE deleted_at IS NULL`,
				{ type: Sequelize.QueryTypes.SELECT }
			)

			const stats = results[0]
			console.log(`📊 Migration validation results:`)
			console.log(`   Total users: ${stats.total_users}`)
			console.log(`   Users with tenant_code: ${stats.users_with_tenant_code}`)
			console.log(`   Users without tenant_code: ${stats.users_without_tenant_code}`)

			// List users still missing tenant_code
			if (parseInt(stats.users_without_tenant_code) > 0) {
				const missingUsers = await this.sequelize.query(
					'SELECT user_id FROM users WHERE tenant_code IS NULL AND deleted_at IS NULL LIMIT 10',
					{ type: Sequelize.QueryTypes.SELECT }
				)

				console.log('⚠️  Users still missing tenant_code:')
				missingUsers.forEach((user) => console.log(`   - ${user.user_id}`))
			}

			return {
				totalUsers: parseInt(stats.total_users),
				usersWithTenantCode: parseInt(stats.users_with_tenant_code),
				usersWithoutTenantCode: parseInt(stats.users_without_tenant_code),
				success: parseInt(stats.users_without_tenant_code) === 0,
			}
		} catch (error) {
			console.error('❌ Error validating migration:', error)
			throw error
		}
	}

	/**
	 * Get migration statistics
	 */
	getStats() {
		const duration = Date.now() - this.stats.startTime
		return {
			...this.stats,
			duration: duration,
			durationFormatted: this.formatDuration(duration),
		}
	}

	/**
	 * Format duration in human readable format
	 */
	formatDuration(ms) {
		const seconds = Math.floor(ms / 1000)
		const minutes = Math.floor(seconds / 60)
		const hours = Math.floor(minutes / 60)

		if (hours > 0) {
			return `${hours}h ${minutes % 60}m ${seconds % 60}s`
		} else if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`
		} else {
			return `${seconds}s`
		}
	}

	/**
	 * Close database connection
	 */
	async close() {
		return await this.dbManager.close()
	}
}

module.exports = ChatDataMigrator
