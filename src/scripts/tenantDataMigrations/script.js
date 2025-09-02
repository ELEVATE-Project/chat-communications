#!/usr/bin/env node

/**
 * Migration Runner for Chat Communications Service
 * Handles tenant_code backfilling for users table using CSV data
 */

require('dotenv').config()
const ChatDataMigrator = require('./helper')
const readline = require('readline')
const fs = require('fs')
const path = require('path')

console.log('🎯 Chat Communications Service - Tenant Data Migration')
console.log('=====================================================')

// Configuration check
console.log('\n📋 Environment Configuration:')
console.log(`   Database URL: ${process.env.DEV_DATABASE_URL ? '✅ Set' : '❌ Missing'}`)
console.log(`   Default Tenant: ${process.env.DEFAULT_TENANT_CODE || 'default'}`)

// Check CSV file
console.log('\n📁 CSV File Status:')
const possibleCsvPaths = [
	path.join(__dirname, '../../../data/user_tenant_mapping.csv'),
	path.join(__dirname, '../../data/user_tenant_mapping.csv'),
	'/var/src/data/user_tenant_mapping.csv',
	path.join(__dirname, '../../../src/data/user_tenant_mapping.csv'),
]

const csvFilePath = possibleCsvPaths.find((p) => fs.existsSync(p)) || possibleCsvPaths[0]
const csvExists = fs.existsSync(csvFilePath)
console.log(`   user_tenant_mapping.csv: ${csvExists ? '✅ Found' : '❌ Missing'}`)

if (csvExists) {
	const stats = fs.statSync(csvFilePath)
	const sizeKB = Math.round(stats.size / 1024)
	const sizeLabel = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)}MB` : `${sizeKB}KB`
	console.log(`     Size: ${sizeLabel}`)
	console.log(`     Modified: ${stats.mtime.toISOString().split('T')[0]}`)

	// Quick peek at file content
	try {
		const content = fs.readFileSync(csvFilePath, 'utf8')
		const lines = content.trim().split('\n')
		console.log(`     Total rows: ${lines.length - 1} (excluding header)`)

		if (lines.length > 1) {
			const header = lines[0]
			console.log(`     Header: ${header}`)

			if (lines.length > 1) {
				const sampleRow = lines[1]
				console.log(`     Sample: ${sampleRow}`)
			}
		}
	} catch (error) {
		console.log(`     Error reading file: ${error.message}`)
	}
}

// Migration execution plan
console.log('\n📋 Migration Execution Plan:')
console.log('   Step 1: Load and validate CSV data (user_id → tenant_code mapping)')
console.log('   Step 2: Validate CSV coverage against database users')
console.log('   Step 3: Batch update users.tenant_code based on CSV mapping')
console.log('   Step 4: Validate migration results')
console.log('')
console.log('   🔄 Processing Method: Batch updates with transaction safety')
console.log('   ⏱️  Estimated Duration: 5-15 minutes depending on user count')
console.log('   🔒 Data Safety: All operations use database transactions')

console.log('\n⚠️  PREREQUISITES & REQUIREMENTS:')
console.log('   ✓ user_tenant_mapping.csv must contain: user_id, tenant_code')
console.log('   ✓ All user_ids in database should have entries in CSV file')
console.log('   ✓ CSV format: user_id,tenant_code (with proper header)')
console.log('   ✓ Database connection configured via DEV_DATABASE_URL')
console.log('   ✓ Run pre-migration-integrity-check.js first')

console.log('\n📊 What This Migration Does:')
console.log('   → Updates tenant_code column for all users based on CSV mapping')
console.log('   → Enables tenant isolation for chat communications')
console.log('   → Prepares users table for composite primary key (user_id, tenant_code)')

if (!csvExists) {
	console.log('\n❌ MISSING CSV FILE:')
	console.log('   Please create user_tenant_mapping.csv first:')
	console.log('   1. Export user-tenant mappings with columns: user_id, tenant_code')
	console.log('   2. Save file as: src/data/user_tenant_mapping.csv')
	console.log('   3. Run pre-migration-integrity-check.js to validate')
	console.log('   4. Re-run this script')
	process.exit(1)
}

// Check database connection before prompting
console.log('\n🔌 Testing database connection...')
const { Pool } = require('pg')

async function testConnection() {
	try {
		const databaseUrl = process.env.DEV_DATABASE_URL
		if (!databaseUrl) {
			throw new Error('DEV_DATABASE_URL not configured')
		}

		const pool = new Pool({ connectionString: databaseUrl })
		const client = await pool.connect()

		const result = await client.query('SELECT current_database(), current_user, version()')
		console.log(`✅ Connected to: ${result.rows[0].current_database}`)
		console.log(`✅ User: ${result.rows[0].current_user}`)

		client.release()
		pool.end()

		return true
	} catch (error) {
		console.log(`❌ Connection failed: ${error.message}`)
		return false
	}
}

// Prompt for confirmation
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
})

async function startMigration() {
	const connectionOk = await testConnection()

	if (!connectionOk) {
		console.log('\n❌ Cannot proceed without database connection')
		process.exit(1)
	}

	console.log('\n⚠️  IMPORTANT REMINDERS:')
	console.log('   → Create a database backup before proceeding')
	console.log('   → Run pre-migration-integrity-check.js first')
	console.log('   → Ensure CSV file contains all users from database')
	console.log('   → This operation cannot be easily undone')

	rl.question('\n🤔 Proceed with tenant_code migration? (y/N): ', async (answer) => {
		if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
			console.log('\n🚀 Starting migration...')
			console.log('   ⏰ Started at:', new Date().toISOString())
			rl.close()

			try {
				const migrator = new ChatDataMigrator()

				console.log('\n📊 Migration Settings:')
				console.log(`   Batch size: ${migrator.BATCH_SIZE}`)
				console.log(`   CSV file: ${csvFilePath}`)

				// Step 1: Load CSV data
				console.log('\n=== STEP 1: Loading CSV Data ===')
				const csvRecordCount = await migrator.loadCSVData(csvFilePath)

				// Step 2: Validate CSV coverage
				console.log('\n=== STEP 2: Validating CSV Coverage ===')
				const coverageResult = await migrator.validateCSVCoverage()

				if (coverageResult.missingInCSV.length > 0) {
					console.log(
						`\n⚠️  WARNING: ${coverageResult.missingInCSV.length} users in database are missing from CSV`
					)
					console.log(`Coverage: ${coverageResult.coveragePercent}%`)

					const continueQuestion = await new Promise((resolve) => {
						const rl2 = readline.createInterface({
							input: process.stdin,
							output: process.stdout,
						})
						rl2.question('Continue anyway? (y/N): ', (answer) => {
							rl2.close()
							resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
						})
					})

					if (!continueQuestion) {
						console.log('❌ Migration cancelled. Please fix CSV coverage first.')
						await migrator.close()
						process.exit(1)
					}
				}

				// Step 3: Process users table
				console.log('\n=== STEP 3: Processing Users Table ===')
				const processingResult = await migrator.processUsersTable()

				// Step 4: Validate migration results
				console.log('\n=== STEP 4: Validating Migration Results ===')
				const validationResult = await migrator.validateMigration()

				// Final summary
				console.log('\n=== MIGRATION SUMMARY ===')
				const stats = migrator.getStats()
				console.log(`   Duration: ${stats.durationFormatted}`)
				console.log(`   CSV records loaded: ${csvRecordCount}`)
				console.log(`   Users processed: ${processingResult.processed}`)
				console.log(`   Users updated: ${processingResult.updated}`)
				console.log(`   Users failed: ${processingResult.failed}`)
				console.log(`   Final users with tenant_code: ${validationResult.usersWithTenantCode}`)
				console.log(`   Final users without tenant_code: ${validationResult.usersWithoutTenantCode}`)

				if (validationResult.success) {
					console.log('\n✅ MIGRATION COMPLETED SUCCESSFULLY!')
					console.log('\n📋 Next Steps:')
					console.log('   1. Run update-tenant-column-script.js to update primary key constraints')
					console.log('   2. Update Sequelize models to use composite primary key')
					console.log('   3. Test application functionality with new tenant isolation')
				} else {
					console.log('\n⚠️  MIGRATION COMPLETED WITH ISSUES')
					console.log(`   ${validationResult.usersWithoutTenantCode} users still missing tenant_code`)
					console.log('   Review the missing users and fix CSV data if needed')
				}

				await migrator.close()
			} catch (error) {
				console.error('\n❌ MIGRATION FAILED:', error.message)
				console.error('Stack trace:', error.stack)
				process.exit(1)
			}
		} else {
			console.log('\n❌ Migration cancelled by user')
			rl.close()
			process.exit(0)
		}
	})
}

// Start the process
startMigration().catch((error) => {
	console.error('❌ Error during startup:', error)
	process.exit(1)
})
