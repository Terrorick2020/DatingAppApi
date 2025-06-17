export async function scanKeys(redisService: any, pattern: string): Promise<string[]> {
	const client = redisService.getClient()
	let cursor = '0'
	const keys: string[] = []

	do {
		const reply = await client.scan(cursor, 'MATCH', pattern, 'COUNT', '100')
		cursor = reply[0]
		keys.push(...reply[1])
	} while (cursor !== '0')

	return keys
}