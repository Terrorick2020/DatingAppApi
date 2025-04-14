import { S3Client } from '@aws-sdk/client-s3'

export const S3Config = new S3Client({
	region: 'ru-central1',
	endpoint: 'https://storage.yandexcloud.net',
	credentials: {
		accessKeyId: process.env.S3_ID || 'YOUR_SECRET_ID',
		secretAccessKey: process.env.S3_KEY || 'YOUR_SECRET_KEY',
	},
})
